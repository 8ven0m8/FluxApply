"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSubscriptionStatus, createRazorpaySubscription, cancelRazorpaySubscription, SubscriptionStatus } from "@/lib/api";
import { ApiError } from "@/lib/api";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function SubscriptionContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const justCheckedOut = searchParams.get("success") === "true";

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status !== "authenticated" || !session?.idToken) return;

    let cancelled = false;
    const token = session.idToken;

    const fetchOnce = () =>
      getSubscriptionStatus(token).then((data) => {
        if (!cancelled) setSub(data);
        return data;
      });

    if (!justCheckedOut) {
      fetchOnce()
        .catch((e) => {
          if (!cancelled) setError(e.message || "Failed to load subscription status");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    // Just returned from Razorpay checkout. The webhook that actually flips
    // `active` to true can lag a few seconds behind the browser-side
    // "payment succeeded" callback, so poll a handful of times with backoff
    // instead of trusting a single fetch right after redirect.
    const delaysMs = [1000, 2000, 3000, 4000, 5000];
    let attempt = 0;

    const poll = () => {
      fetchOnce()
        .then((data) => {
          if (cancelled) return;
          if (data.active || attempt >= delaysMs.length) {
            setLoading(false);
            // Strip ?success=true so a manual refresh doesn't re-poll.
            router.replace("/subscription");
            return;
          }
          const delay = delaysMs[attempt];
          attempt += 1;
          setTimeout(poll, delay);
        })
        .catch((e) => {
          if (!cancelled) {
            setError(e.message || "Failed to load subscription status");
            setLoading(false);
          }
        });
    };
    poll();

    return () => {
      cancelled = true;
    };
  }, [status, session, router, justCheckedOut]);

  const handleSubscribe = async () => {
    if (!session?.idToken) return;
    setSubscribing(true);
    setError(null);
    try {
      const { subscription_id, key_id } = await createRazorpaySubscription(
        session.idToken,
        window.location.href,
        window.location.href
      );

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => {
        const options = {
          key: key_id,
          subscription_id: subscription_id,
          name: "FluxApply",
          description: "Monthly Subscription",
          prefill: {
            email: session.user?.email || "",
          },
          handler: () => {
            router.push("/subscription?success=true");
          },
          modal: {
            ondismiss: () => {
              setSubscribing(false);
            },
          },
          theme: { color: "#3B6E5E" },
        };
        const rzp = new window.Razorpay(options);
        // Real Razorpay Checkout.js event is "payment.failed", not
        // "payment.error" — the old name never fired, so failed/declined
        // payments (e.g. a rejected autopay mandate) silently left the
        // button stuck on "Starting payment…" with no error shown.
        rzp.on("payment.failed", (response: any) => {
          setError(response.error?.description || "Payment failed");
          setSubscribing(false);
        });
        rzp.open();
      };
      script.onerror = () => {
        setError("Couldn't load the Razorpay checkout script. Check your connection and try again.");
        setSubscribing(false);
      };
      document.body.appendChild(script);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Something went wrong");
      setSubscribing(false);
    }
  };

  const handleCancel = async () => {
    if (!session?.idToken) return;
    const expiryText = sub?.expires_at
      ? new Date(sub.expires_at).toLocaleDateString()
      : "the end of your current billing period";
    const confirmed = window.confirm(
      `Cancel your subscription? You'll keep full access until ${expiryText} — you just won't be charged again after that.`
    );
    if (!confirmed) return;

    setCancelling(true);
    setError(null);
    try {
      const latest = await cancelRazorpaySubscription(session.idToken);
      setSub(latest);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Something went wrong cancelling your subscription");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-ink/50">
          {justCheckedOut ? "Confirming your payment…" : "Loading subscription…"}
        </p>
      </div>
    );
  }

  const isActive = sub?.active ?? false;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-14">
      <div className="w-full max-w-md space-y-6">
        <h1 className="font-display text-2xl">Get your subscription</h1>
        {error && (
          <div className="rounded border border-rust/30 bg-rust/5 px-4 py-3 text-sm text-rust">
            {error}
          </div>
        )}
        {isActive ? (
          <div className="rounded border border-accent/30 bg-accent/5 px-4 py-4 text-sm">
            {sub?.cancel_at_period_end ? (
              <>
                <p className="font-medium text-ink">Subscription cancelled.</p>
                <p className="mt-1 text-ink/60">
                  You'll keep full access until{" "}
                  {sub?.expires_at ? new Date(sub.expires_at).toLocaleDateString() : "your period ends"}, then it won't renew.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-accentDark">You have an active subscription.</p>
                {sub?.expires_at && (
                  <p className="mt-1 text-ink/60">
                    Renews: {new Date(sub.expires_at).toLocaleDateString()}
                  </p>
                )}
                <p className="mt-3 text-xs text-ink/50">
                  To update your payment method, visit the Razorpay Dashboard
                  (you'll get a link in your email). You can cancel below.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded border border-line p-4">
              <p className="font-medium">Monthly Plan</p>
              <p className="text-sm text-ink/60">Get monthly access to the FluxApply services. Generate cover letters and tailored resumes.</p>
              <p className="mt-2 text-lg font-display">₹299 / month</p>
            </div>
            <button
              onClick={handleSubscribe}
              disabled={subscribing}
              className="w-full rounded bg-accent py-2 text-sm font-medium text-paper hover:bg-accentDark disabled:opacity-50"
            >
              {subscribing ? "Starting payment…" : "Subscribe now"}
            </button>
          </div>
        )}
        {isActive && sub?.razorpay_subscription_id && !sub?.cancel_at_period_end && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="w-full rounded border border-rust/30 py-2 text-sm font-medium text-rust hover:bg-rust/5 disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : "Cancel subscription"}
          </button>
        )}
        <button
          onClick={() => router.push("/")}
          className="mt-4 text-sm text-ink/50 underline underline-offset-2 hover:text-ink"
        >
          ← Back to login page
        </button>
      </div>
    </div>
  );
}