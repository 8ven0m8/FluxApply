# subscription_utils.py
import os
from dotenv import load_dotenv
load_dotenv()
import logging
from datetime import datetime, timezone
from typing import Optional
from langgraph.store.base import BaseStore

logger = logging.getLogger(__name__)

# Comma‑separated list of emails that can bypass the subscription check
SUBSCRIPTION_EXEMPT_EMAILS = set(
    email.strip()
    for email in os.getenv("SUBSCRIPTION_EXEMPT_EMAILS", "").split(",")
    if email.strip()
)


def get_subscription(store: BaseStore, user_id: str) -> dict:
    result = store.get(("user", user_id, "subscription"), "current")
    if result is None:
        return {
            "active": False,
            "expires_at": None,
            "razorpay_subscription_id": None,
            "razorpay_customer_id": None,
            "plan_id": None,
            "cancel_at_period_end": False,
        }
    data = result.value["data"]
    return {
        "active": data.get("active", False),
        "expires_at": data.get("expires_at"),
        "razorpay_subscription_id": data.get("razorpay_subscription_id"),
        "razorpay_customer_id": data.get("razorpay_customer_id"),
        "plan_id": data.get("plan_id"),
        "cancel_at_period_end": data.get("cancel_at_period_end", False),
    }


def set_subscription(
    store: BaseStore,
    user_id: str,
    active: bool,
    expires_at: Optional[datetime] = None,
    razorpay_subscription_id: Optional[str] = None,
    razorpay_customer_id: Optional[str] = None,
    plan_id: Optional[str] = None,
    cancel_at_period_end: bool = False,
) -> None:
    data = {
        "active": active,
        "expires_at": expires_at.isoformat() if expires_at else None,
        "razorpay_subscription_id": razorpay_subscription_id,
        "razorpay_customer_id": razorpay_customer_id,
        "plan_id": plan_id,
        "cancel_at_period_end": cancel_at_period_end,
    }
    store.put(("user", user_id, "subscription"), "current", {"data": data})


def is_subscribed(store: BaseStore, user_id: str, email: Optional[str] = None) -> bool:
    """Return True if the user has an active subscription or is exempt."""
    if email and email in SUBSCRIPTION_EXEMPT_EMAILS:
        return True
    sub = get_subscription(store, user_id)
    if not sub["active"]:
        return False
    expires_at = sub.get("expires_at")
    if expires_at:
        try:
            expiry = datetime.fromisoformat(expires_at)
            if expiry < datetime.now(timezone.utc):
                return False
        except (ValueError, TypeError):
            return False
    return True


def require_subscription(store: BaseStore, user_id: str, email: Optional[str] = None) -> None:
    """
    Raise SubscriptionRequiredError unless the user has an active subscription.
    If `email` is provided and is in SUBSCRIPTION_EXEMPT_EMAILS, the check is skipped.
    """
    if email and email in SUBSCRIPTION_EXEMPT_EMAILS:
        logger.info("Subscription check bypassed for exempt email: %s", email)
        return

    sub = get_subscription(store, user_id)
    if not sub["active"]:
        raise SubscriptionRequiredError("Active subscription required.")
    expires_at = sub.get("expires_at")
    if expires_at:
        try:
            expiry = datetime.fromisoformat(expires_at)
            if expiry < datetime.now(timezone.utc):
                raise SubscriptionRequiredError("Subscription has expired.")
        except (ValueError, TypeError):
            raise SubscriptionRequiredError("Invalid subscription expiry.")


class SubscriptionRequiredError(Exception):
    pass


# ---------- Webhook idempotency ----------
# Razorpay (like most payment providers) can and will redeliver the same
# webhook event more than once — on timeouts, retries after a slow 2xx, etc.
# Our handler is *mostly* idempotent already (it just overwrites state), but
# a replayed/duplicate event for an old subscription could still resurrect
# state that a later, newer event already superseded (e.g. an old
# "activated" event replayed after a legitimate "cancelled"). Recording
# processed event IDs makes replays a safe no-op regardless of ordering.
def was_webhook_event_processed(store: BaseStore, event_id: str) -> bool:
    if not event_id:
        return False
    result = store.get(("webhook_events", "razorpay"), event_id)
    return result is not None


def mark_webhook_event_processed(store: BaseStore, event_id: str, event_type: str) -> None:
    if not event_id:
        return
    store.put(
        ("webhook_events", "razorpay"),
        event_id,
        {
            "event_type": event_type,
            "processed_at": datetime.now(timezone.utc).isoformat(),
        },
    )