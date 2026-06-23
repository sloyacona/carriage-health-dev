"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    // Always show "check your email" regardless of outcome — prevents account enumeration.
    await supabase.auth.resetPasswordForEmail(email, {
      // type=recovery signals the callback route to redirect to the reset-password page
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });

    setLoading(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="text-center space-y-3">
        <h2 className="text-lg font-medium text-stone-800">Check your email</h2>
        <p className="text-sm text-stone-600">
          If an account exists for{" "}
          <span className="font-medium">{email}</span>, we sent a password
          reset link.
        </p>
        <Link
          href="/login"
          className="block text-sm text-stone-500 underline mt-4"
        >
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-stone-800 mb-1">
          Reset your password
        </h2>
        <p className="text-sm text-stone-500 mb-4">
          Enter your email and we'll send you a reset link.
        </p>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-stone-700 mb-1"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-stone-800 text-white rounded-md py-2 text-sm font-medium hover:bg-stone-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center">
        <Link href="/login" className="text-sm text-stone-500 underline">
          Back to log in
        </Link>
      </p>
    </form>
  );
}
