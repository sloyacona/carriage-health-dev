"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser client: uses the anon key only, subject to RLS.
// Safe to use in Client Components. Never receives service-role key.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
