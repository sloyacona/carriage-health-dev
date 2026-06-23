import "server-only";

import { createSupabaseAdminClient } from "./supabase/server";
import type { AuditAction } from "@/types";

interface AuditParams {
  actor: string;       // member_id, 'system', or 'webhook'
  action: AuditAction;
  resource: string;    // e.g. "orders/abc-123" or "results/xyz-456"
  memberId?: string | null;
  ipAddress?: string | null;
}

// Every access to patient health data must call this. Failures throw — they are never
// silently swallowed, because a silent audit failure is a compliance gap.
export async function writeAuditLog({
  actor,
  action,
  resource,
  memberId = null,
  ipAddress = null,
}: AuditParams): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("audit_log").insert({
    actor,
    action,
    resource,
    member_id: memberId,
    ip_address: ipAddress,
  });

  if (error) {
    console.error("[audit-log] Write failed:", error.message);
    throw new Error(`Audit log write failed: ${error.message}`);
  }
}
