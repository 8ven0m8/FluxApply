import { Suspense } from "react";
import SubscriptionContent from "./SubscriptionContent";

export default function SubscriptionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-ink/50">Loading subscription…</p>
        </div>
      }
    >
      <SubscriptionContent />
    </Suspense>
  );
}