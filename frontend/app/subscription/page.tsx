"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSubscriptionStatus, createRazorpaySubscription, cancelRazorpaySubscription, SubscriptionStatus } from "@/lib/api";
import { ApiError } from "@/lib/api";

// Load Razorpay JS SDK dynamically
declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function SubscriptionPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Check if we just returned from payment
  const razorpayPaymentId = searchParams.get("razorpay_payment_id");
  const razorpaySignature = searchParams.get("razorpay_signature");
  const razorpaySubscriptionId = searchParams.get("razorpay_subscription_id");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated" && session?.idToken) {
      // If we have payment params, we can optionally verify on the server,
      // but the webhook will handle it. Just refresh status.
      getSubscriptionStatus(session.idToken)
        .then((data) => {
          setSub(data);
          setLoading(false);
        })
        .catch((e) => {
          setError(e.message || "Failed to load subscription status");
          setLoading(false);
        });
    }
  }, [status, session, router, razorpayPaymentId]);

  const handleSubscribe = async () => {
    if (!session?.idToken) return;
    setSubscribing(true);
    setError(null);
    try {
      // 1. Create subscription on backend
      const { subscription_id, key_id } = await createRazorpaySubscription(
        session.idToken,
        window.location.href,
        window.location.href
      );

      // 2. Load Razorpay checkout
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => {
        const options = {
          key: key_id,
          subscription_id: subscription_id,
          name: "FluxApply",
          description: "Monthly Subscription",
          // prefill: { email: session.user?.email, contact: "" },
          modal: {
            ondismiss: () => {
              setSubscribing(false);
            },
          },
          theme: { color: "#3B6E5E" },
        };
        const rzp = new window.Razorpay(options);
        rzp.open();
        rzp.on("payment.success", (response: any) => {
          // The webhook will handle activation; we can redirect to refresh status.
          router.push("/subscription?success=true");
        });
        rzp.on("payment.error", (response: any) => {
          setError(response.error.description || "Payment failed");
          setSubscribing(false);
        });
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
      // The backend updates its own record synchronously here (it's a
      // direct server-to-server call to Razorpay, not something inferred
      // from the client), so the response already reflects the scheduled
      // cancellation — no need to poll or refetch.
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
        <p className="text-sm text-ink/50">Loading subscription…</p>
      </div>
    );
  }

  const isActive = sub?.active ?? false;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-14">
      <div className="w-full max-w-md space-y-6">
        <h1 className="font-display text-2xl">Subscription</h1>
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
              <p className="text-sm text-ink/60">Unlimited access to resume tailoring and cover letters.</p>
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
          ← Back to app
        </button>
      </div>
    </div>
  );
}