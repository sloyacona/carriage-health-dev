import "server-only";

import { junction } from "./junction";
import { createSupabaseAdminClient } from "./supabase/server";
import { writeAuditLog } from "./audit-log";

export type ProvisionResult =
  | { ok: true; alreadyExisted: boolean }
  | { ok: false; step: string; detail: string };

// Provisions a new member row and Junction user for a given Supabase auth user.
// Idempotent: if the member row already exists, returns ok + alreadyExisted: true.
// Called from two places:
//   - /auth/callback     (when email confirmation is ON)
//   - /api/auth/provision-user (when email confirmation is OFF and signUp() returns immediately)
export async function provisionMember(
  authId: string,
  email: string,
  ipAddress: string | null
): Promise<ProvisionResult> {
  const tag = "[provision-member]";

  const db = createSupabaseAdminClient();

  // ── Step 3: verify service-role client works ──────────────────────────────
  try {
    const { error, status } = await db
      .from("audit_log")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error(`${tag} step-3 failed: HTTP ${status}`);
      return {
        ok: false,
        step: "step-3",
        detail: String(error.message || error.code || `HTTP ${status}`),
      };
    }
  } catch (thrown) {
    console.error(`${tag} step-3 threw (network error)`);
    return { ok: false, step: "step-3", detail: "network error" };
  }

  // ── Step 4: check for existing member ────────────────────────────────────
  const { data: existing, error: existingError } = await db
    .from("members")
    .select("id")
    .eq("auth_id", authId)
    .maybeSingle();

  if (existingError) {
    console.error(`${tag} step-4 failed`);
    return { ok: false, step: "step-4", detail: existingError.code };
  }

  if (existing) {
    return { ok: true, alreadyExisted: true };
  }

  // ── Step 5: create member row ─────────────────────────────────────────────
  const { data: member, error: memberError } = await db
    .from("members")
    .insert({ auth_id: authId, email })
    .select("id")
    .single();

  if (memberError || !member) {
    console.error(`${tag} step-5 failed`);
    return { ok: false, step: "step-5", detail: memberError?.code ?? "no data" };
  }

  // ── Step 6: create Junction user ─────────────────────────────────────────
  // client_user_id is a fresh opaque UUID — no PII (guardrail #6)
  const clientUserId = crypto.randomUUID();
  let junctionUserId: string;

  try {
    const junctionUser = await junction.createUser(clientUserId);
    junctionUserId = junctionUser.user_id;
  } catch (err) {
    console.error(`${tag} step-6 failed: Junction createUser`);
    return { ok: false, step: "step-6", detail: "junction api error" };
  }

  // ── Step 7: store junction_users mapping ──────────────────────────────────
  const { error: juError } = await db.from("junction_users").insert({
    member_id: member.id,
    junction_user_id: junctionUserId,
    client_user_id: clientUserId,
  });

  if (juError) {
    console.error(`${tag} step-7 failed`);
    return { ok: false, step: "step-7", detail: juError.code };
  }

  // ── Step 8: audit log ─────────────────────────────────────────────────────
  try {
    await writeAuditLog({
      actor: member.id,
      action: "member.create",
      resource: `members/${member.id}`,
      memberId: member.id,
      ipAddress,
    });
  } catch (err) {
    // Audit failure is serious but must not block signup from completing
    console.error(`${tag} step-8 failed: audit log`);
  }

  return { ok: true, alreadyExisted: false };
}
