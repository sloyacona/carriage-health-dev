import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { provisionMember } from "@/lib/provision-member";

// GET /auth/callback
//
// Supabase redirects here after:
//   (a) email confirmation (confirmation ON)  — provision member + Junction user
//   (b) password reset                        — redirect to /auth/reset-password
//
// ?type=recovery distinguishes the two flows.
// ?code is the PKCE auth code exchanged for a session server-side.
//
// When email confirmation is OFF (local dev), signUp() returns a session immediately
// and this route is NOT hit. Provisioning is handled by POST /api/auth/provision-user
// instead, called directly from the signup page.

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");

  if (!code) {
    console.error("[auth/callback] no code in request — check Supabase Redirect URL allowlist");
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const redirectTarget =
    type === "recovery" ? `${origin}/auth/reset-password` : `${origin}/dashboard`;
  const response = NextResponse.redirect(redirectTarget);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: Parameters<typeof response.cookies.set>[2] }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !data.user) {
    console.error("[auth/callback] code exchange failed");
    return NextResponse.redirect(`${origin}/login?error=invalid_code`);
  }

  if (type === "recovery") {
    return response;
  }

  const result = await provisionMember(
    data.user.id,
    data.user.email!,
    request.headers.get("x-forwarded-for")
  );

  if (!result.ok) {
    console.error("[auth/callback] provisioning failed at", result.step);
    return NextResponse.redirect(`${origin}/login?error=provisioning_failed`);
  }

  return response;
}
