import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { provisionMember } from "@/lib/provision-member";

// POST /api/auth/provision-user
//
// Called by the signup page when Supabase email confirmation is OFF.
// In that mode, signUp() returns an immediate session and never hits /auth/callback,
// so this route takes over the provisioning step.
//
// When email confirmation is ON, this route is not called — /auth/callback handles it.

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error("[provision-user] no authenticated user — cannot provision");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await provisionMember(
    user.id,
    user.email!,
    request.headers.get("x-forwarded-for")
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: "Provisioning failed", step: result.step, detail: result.detail },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, alreadyExisted: result.alreadyExisted });
}
