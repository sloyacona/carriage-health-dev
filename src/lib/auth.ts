import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./supabase/server";

// Returns the authenticated user, or null if no valid session.
export async function getSession(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) return null;
  return user;
}

// Use in Server Components and Route Handlers that require authentication.
// Redirects to /login rather than throwing — never exposes auth errors to the caller.
export async function getRequiredSession(): Promise<User> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}
