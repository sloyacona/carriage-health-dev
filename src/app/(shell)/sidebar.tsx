"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// ── Inline SVG icons (no icon library dep) ───────────────────────────────────

function DashboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ResultsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ── Nav items (Dashboard + Results — Account is accessed via profile block) ───

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
  { href: "/results",   label: "Results",   Icon: ResultsIcon   },
] as const;

// ── AppShell ──────────────────────────────────────────────────────────────────
// Wraps the entire logged-in shell: persistent sidebar on desktop, top bar on
// mobile. Children remain Server Components — this pattern is valid in Next.js
// because children are passed as a prop, not imported into a client module.

export function AppShell({
  userEmail,
  userInitial,
  children,
}: {
  userEmail: string;
  userInitial: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const supabase = createSupabaseBrowserClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    // Hard redirect: ensures fresh cookies reach the middleware and bypasses
    // the App Router's client-side cache, which can race with cookie clearing.
    window.location.href = "/login";
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="flex min-h-screen bg-linen">

      {/* ── Desktop sidebar — hidden on mobile ───────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-white sm:flex">
        {/* Wordmark */}
        <div className="px-6 pt-6 pb-4">
          <span className="font-serif text-base font-medium text-charcoal tracking-tight">
            Carriage Health
          </span>
        </div>

        {/* Primary nav */}
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive(href)
                  ? "bg-champagne text-charcoal"
                  : "text-muted hover:bg-linen hover:text-charcoal"
              }`}
            >
              <Icon />
              {label}
            </Link>
          ))}
        </nav>

        {/* Bottom: sign out + profile/account block */}
        <div className="px-3 pb-6 space-y-2">
          <button
            onClick={handleSignOut}
            className="w-full rounded-xl px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-linen hover:text-charcoal"
          >
            Sign out
          </button>

          {/* Profile block — links to /account once that page is built */}
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-linen p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-charcoal font-serif text-sm text-white">
              {userInitial}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-muted">Account</span>
              <span className="block truncate text-sm font-medium text-charcoal">
                {userEmail}
              </span>
            </span>
            <span className="shrink-0 text-muted">
              <ChevronRightIcon />
            </span>
          </div>
        </div>
      </aside>

      {/* ── Content column (mobile top bar + page content) ───────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* Mobile top bar — hidden on desktop */}
        <header className="flex sm:hidden items-center justify-between border-b border-border bg-white px-6 py-4">
          <span className="font-serif text-sm font-medium text-charcoal tracking-tight">
            Carriage Health
          </span>
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive(href)
                    ? "bg-champagne text-charcoal"
                    : "text-muted"
                }`}
              >
                {label}
              </Link>
            ))}
            <span
              aria-hidden="true"
              className="ml-2 flex h-9 w-9 items-center justify-center rounded-full bg-charcoal font-serif text-sm text-white"
            >
              {userInitial}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-6 py-10 sm:px-10">
          <div className="mx-auto max-w-2xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
