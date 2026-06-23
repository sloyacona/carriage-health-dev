"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function SuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectStatus = searchParams.get("redirect_status");
  const succeeded = redirectStatus === "succeeded";

  useEffect(() => {
    if (succeeded) {
      const timer = setTimeout(() => router.replace("/dashboard"), 3000);
      return () => clearTimeout(timer);
    }
  }, [succeeded, router]);

  if (!succeeded) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-2xl text-charcoal">Payment not completed</h1>
        <p className="text-sm text-muted leading-relaxed">
          Your payment was not processed. No charge was made.
        </p>
        <Link
          href="/checkout"
          className="inline-block rounded-2xl bg-charcoal px-6 py-3 text-sm font-medium text-white hover:bg-charcoal/90 transition-colors"
        >
          Return to checkout
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success card */}
      <div className="rounded-3xl bg-champagne border border-border p-8 text-center space-y-3">
        <div className="text-3xl">&#10003;</div>
        <h1 className="font-serif text-2xl text-charcoal">Payment received</h1>
        <p className="text-sm text-muted leading-relaxed">
          Your payment of $1,499 was received. We&apos;re preparing your
          Carriage Panel — you&apos;ll see next steps in your dashboard.
        </p>
      </div>

      <p className="text-center text-xs text-muted">
        Redirecting to your dashboard&hellip;
      </p>

      <Link
        href="/dashboard"
        className="block w-full rounded-2xl bg-charcoal py-4 text-center text-base font-medium text-white hover:bg-charcoal/90 transition-colors"
      >
        Go to dashboard
      </Link>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse space-y-4">
          <div className="h-7 w-48 rounded-lg bg-border" />
          <div className="h-40 rounded-3xl bg-border" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
