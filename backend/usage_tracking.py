#----------------------------------------------------------------------#
# Tracks OpenAI/LLM token usage and cost per user, so the app can:     #
#   - see spend/usage broken down by user and endpoint                #
#   - enforce a monthly $ safety cap per user (independent of whatever #
#     product-level plan limit — e.g. "N generations/month" — you      #
#     build in the frontend on top of get_monthly_usage() below)       #
#                                                                        #
# Uses its own small synchronous connection pool (same pattern as the  #
# PostgresStore / checkpointer pools in app.py) rather than piggy-      #
# backing on the LangGraph store, because usage logs are a simple      #
# append-only table we want to SUM/GROUP BY with plain SQL — not what  #
# the key-value store API is built for.                                #
#----------------------------------------------------------------------#

import logging
from os import getenv
from typing import Optional
from dotenv import load_dotenv

from psycopg_pool import ConnectionPool

load_dotenv()

logger = logging.getLogger(__name__)

DB_URI = getenv("DB_URI")

# USD per 1M tokens. This is the only place cost math lives — update it if
# you change models or OpenAI changes pricing. (Rates as of mid-2026.)
MODEL_PRICING = {
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1-nano": (0.10, 0.40),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4.1": (2.00, 8.00),
    "gpt-4o": (2.50, 10.00),
}
# Fallback if the model isn't in the table above (e.g. the free proxy's
# "auto" model, or a new model you haven't priced yet) — assumes gpt-4.1-mini
# rates so usage is still tracked, just possibly under/over-estimated in $.
DEFAULT_PRICING = (0.40, 1.60)

_usage_pool: Optional[ConnectionPool] = None


class UsageLimitExceeded(Exception):
    """Raised when a user has hit their monthly usage cap."""
    pass


def open_usage_pool(min_size: int = 1, max_size: int = 5) -> ConnectionPool:
    """Call once from app.py's lifespan startup. Creates the usage_logs table if missing."""
    global _usage_pool
    _usage_pool = ConnectionPool(DB_URI, min_size=min_size, max_size=max_size, open=True)
    with _usage_pool.connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS llm_usage (
                id BIGSERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                node_name TEXT NOT NULL,
                model TEXT NOT NULL,
                input_tokens INTEGER NOT NULL,
                output_tokens INTEGER NOT NULL,
                cost_usd NUMERIC(12, 6) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_llm_usage_user_created ON llm_usage (user_id, created_at);"
        )
    logger.info("Usage tracking pool ready (min=%d, max=%d)", min_size, max_size)
    return _usage_pool


def close_usage_pool():
    """Call once from app.py's lifespan shutdown."""
    global _usage_pool
    if _usage_pool is not None:
        _usage_pool.close()
        _usage_pool = None


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    input_price, output_price = MODEL_PRICING.get(model, DEFAULT_PRICING)
    return (input_tokens / 1_000_000) * input_price + (output_tokens / 1_000_000) * output_price


def extract_token_usage(ai_message) -> tuple:
    """
    Pulls (model, input_tokens, output_tokens) off a LangChain AIMessage.
    Tries the provider-agnostic `usage_metadata` field first, falls back to
    OpenAI's `response_metadata['token_usage']` shape. Returns zeros rather
    than raising if neither is present — a shape we can't parse should never
    take down the actual LLM response it's attached to.
    """
    response_metadata = getattr(ai_message, "response_metadata", None) or {}
    model = response_metadata.get("model_name", "unknown")

    usage = getattr(ai_message, "usage_metadata", None)
    if usage:
        return model, usage.get("input_tokens", 0), usage.get("output_tokens", 0)

    token_usage = response_metadata.get("token_usage") or {}
    if token_usage:
        return model, token_usage.get("prompt_tokens", 0), token_usage.get("completion_tokens", 0)

    return model, 0, 0


def log_llm_usage(user_id: str, endpoint: str, node_name: str, ai_message) -> None:
    """
    Logs one LLM call's usage. Deliberately swallows DB errors (logs them
    instead) — usage logging must never break the actual resume/JD
    generation it's measuring.
    """
    if _usage_pool is None:
        logger.warning("Usage pool not initialized — skipping usage log for user_id=%s", user_id)
        return

    model, input_tokens, output_tokens = extract_token_usage(ai_message)
    cost = estimate_cost(model, input_tokens, output_tokens)

    try:
        with _usage_pool.connection() as conn:
            conn.execute(
                """
                INSERT INTO llm_usage
                    (user_id, endpoint, node_name, model, input_tokens, output_tokens, cost_usd)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (user_id, endpoint, node_name, model, input_tokens, output_tokens, cost),
            )
    except Exception:
        logger.exception("Failed to log LLM usage for user_id=%s, endpoint=%s", user_id, endpoint)


def get_monthly_usage(user_id: str) -> dict:
    """Returns this calendar month's usage totals for a user."""
    if _usage_pool is None:
        raise RuntimeError("Usage pool not initialized.")

    with _usage_pool.connection() as conn:
        row = conn.execute(
            """
            SELECT
                COUNT(*) AS call_count,
                COALESCE(SUM(input_tokens), 0) AS input_tokens,
                COALESCE(SUM(output_tokens), 0) AS output_tokens,
                COALESCE(SUM(cost_usd), 0) AS cost_usd
            FROM llm_usage
            WHERE user_id = %s
              AND date_trunc('month', created_at) = date_trunc('month', now())
            """,
            (user_id,),
        ).fetchone()

    return {
        "call_count": row[0],
        "input_tokens": row[1],
        "output_tokens": row[2],
        "cost_usd": float(row[3]),
    }


def enforce_monthly_cap(user_id: str, max_cost_usd: float) -> None:
    """
    Safety-net cap on total $ spend per user per month — this is a backstop
    against a runaway or abusive user, independent of whatever product-level
    plan limit (e.g. "N generations/month" for your ₹300 tier) you enforce
    in the frontend/product logic on top of get_monthly_usage().
    """
    usage = get_monthly_usage(user_id)
    if usage["cost_usd"] >= max_cost_usd:
        raise UsageLimitExceeded(
            f"user_id={user_id!r} has used ${usage['cost_usd']:.4f} this month, "
            f"at or above the ${max_cost_usd:.2f} cap."
        )
