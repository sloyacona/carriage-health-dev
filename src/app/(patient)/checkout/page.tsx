"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

// Publishable key is the ONLY Stripe key that belongs in the browser bundle.
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

// ─── Stripe Elements appearance — Champagne & Charcoal palette ───────────────
const stripeAppearance = {
  variables: {
    colorPrimary: "#201e1b",
    colorBackground: "#ffffff",
    colorText: "#201e1b",
    colorTextSecondary: "#7c7a72",
    colorDanger: "#b4533f",
    fontFamily: '"Mulish", ui-sans-serif, system-ui, sans-serif',
    fontSizeBase: "14px",
    borderRadius: "12px",
  },
  rules: {
    ".Input": {
      border: "1px solid #e7e5dc",
      backgroundColor: "#fbfbf7",
      padding: "12px 14px",
      boxShadow: "none",
    },
    ".Input:focus": {
      border: "1px solid #201e1b",
      boxShadow: "none",
      outline: "none",
    },
    ".Label": {
      fontSize: "13px",
      fontWeight: "500",
      color: "#201e1b",
      marginBottom: "6px",
    },
    ".Tab": {
      border: "1px solid #e7e5dc",
      backgroundColor: "#fbfbf7",
    },
    ".Tab--selected": {
      border: "1px solid #201e1b",
      backgroundColor: "#eef4d8",
    },
    ".Tab:hover": {
      border: "1px solid #201e1b",
    },
  },
};

// ─── Inner form component ─────────────────────────────────────────────────────
function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !agreed) return;

    setLoading(true);
    setErrorMsg(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success`,
      },
    });

    // If confirmPayment resolves without redirect, an error occurred.
    if (error) {
      setErrorMsg(error.message ?? "Payment failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Order summary */}
      <div>
        <h2 className="font-serif text-lg text-charcoal mb-3">Order summary</h2>
        <div className="rounded-2xl bg-champagne border border-border p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-charcoal">The Carriage Panel</p>
              <p className="text-xs text-muted mt-0.5">
                35+ markers · Quest walk-in · physician review
              </p>
            </div>
            <p className="text-sm font-medium text-charcoal shrink-0">$1,499</p>
          </div>
          <div className="border-t border-border/60 pt-3 flex items-center justify-between">
            <p className="text-sm text-charcoal font-medium">Total due today</p>
            <p className="font-serif text-lg text-charcoal">$1,499</p>
          </div>
        </div>
      </div>

      {/* Payment fields */}
      <div>
        <h2 className="font-serif text-lg text-charcoal mb-3">Payment details</h2>
        <div className="rounded-2xl border border-border bg-white p-5">
          <PaymentElement />
        </div>
      </div>

      {/* Acknowledgment */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 shrink-0 accent-charcoal"
        />
        <span className="text-xs text-muted leading-relaxed">
          By completing this purchase, I authorize Carriage Health to charge
          $1,499 for the Carriage Reproductive Panel. I understand this is a
          one-time charge with no subscription.
        </span>
      </label>

      {errorMsg && (
        <p className="text-sm text-red-600 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={!stripe || !agreed || loading}
        className="w-full rounded-2xl bg-charcoal py-4 text-base font-medium text-white transition-colors hover:bg-charcoal/90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? "Processing…" : "Purchase · $1,499"}
      </button>

      <p className="text-center text-xs text-muted">
        Secure checkout &middot; paid in full today &middot; nothing billed later
      </p>
    </form>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────
export default function CheckoutPage() {
  const router = useRouter();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Guard against React Strict Mode's double-mount firing two POST requests,
  // which would create two concurrent orders before either DB insert commits.
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    fetch("/api/stripe/create-payment-intent", { method: "POST" })
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const data = await res.json();
        if (data.redirect) {
          router.replace(data.redirect);
          return;
        }
        if (!data.clientSecret) {
          setFetchError("Unable to start checkout. Please try again.");
          return;
        }
        setClientSecret(data.clientSecret);
      })
      .catch(() => setFetchError("Network error. Please refresh and try again."));
  }, [router]);

  if (fetchError) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-2xl text-charcoal">Checkout</h1>
        <p className="text-sm text-red-600 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          {fetchError}
        </p>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-7 w-32 rounded-lg bg-border" />
        <div className="h-28 rounded-2xl bg-border" />
        <div className="h-48 rounded-2xl bg-border" />
        <div className="h-12 rounded-2xl bg-border" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-charcoal">Checkout</h1>
        <p className="text-sm text-muted mt-1">One clear price. No subscriptions.</p>
      </div>

      <Elements
        stripe={stripePromise}
        options={{ clientSecret, appearance: stripeAppearance }}
      >
        <CheckoutForm />
      </Elements>
    </div>
  );
}
