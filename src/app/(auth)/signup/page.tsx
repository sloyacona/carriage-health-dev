"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Used when email confirmation is ON — Supabase redirects here after the click.
        // When confirmation is OFF this option is ignored; provisioning runs below instead.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      // Email confirmation is OFF — Supabase returned an immediate session.
      // Provision the member + Junction user server-side, then go to the dashboard.
      const res = await fetch("/api/auth/provision-user", { method: "POST" });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoading(false);
        setError(
          `Account created but setup failed at ${body.step ?? "unknown step"}. ` +
          "Please try logging in — if the problem persists, contact support."
        );
        return;
      }

      router.push("/dashboard");
      router.refresh();
      return;
    }

    // Email confirmation is ON — session is null, email was sent.
    setLoading(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="text-center space-y-3">
        <h2 className="text-lg font-medium text-stone-800">Check your email</h2>
        <p className="text-sm text-stone-600">
          We sent a confirmation link to{" "}
          <span className="font-medium">{email}</span>. Click it to activate
          your account.
        </p>
        <p className="text-xs text-stone-400 mt-4">
          Didn&apos;t receive it? Check your spam folder.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
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

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-stone-700 mb-1"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
        />
        <p className="text-xs text-stone-400 mt-1">Minimum 8 characters</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-stone-800 text-white rounded-md py-2 text-sm font-medium hover:bg-stone-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-sm text-stone-500">
        Already have an account?{" "}
        <Link href="/login" className="text-stone-700 underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
