import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit-log";
import type { OrderStatus } from "@/types";

// Junction delivers webhooks via Svix. Every incoming request carries three headers —
// svix-id, svix-timestamp, svix-signature — which the Svix SDK uses to verify the
// HMAC-SHA256 signature against JUNCTION_WEBHOOK_SECRET (guardrail #1).
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing Svix headers" }, { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    const wh = new Webhook(process.env.JUNCTION_WEBHOOK_SECRET!);
    event = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as Record<string, unknown>;
  } catch (err) {
    console.error(
      "[junction/webhook] Signature verification failed:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const eventType = event.event_type as string | undefined;
  const data = (event.data ?? {}) as Record<string, unknown>;
  const db = createSupabaseAdminClient();

  if (eventType === "labtest.order.updated") {
    await handleOrderUpdated(db, data);
  } else if (eventType === "labtest.result.critical") {
    await handleResultCritical(db, data);
  } else if (
    eventType === "labtest.appointment.created" ||
    eventType === "labtest.appointment.updated"
  ) {
    // Appointment records are written by our /api/schedule/book route when the patient
    // books through our UI. This handler would catch external changes — no-op for MVP.
    console.log(`[junction/webhook] ${eventType} received (no-op for MVP)`);
  }

  return NextResponse.json({ received: true });
}

// ── Junction order status → our status mapping ────────────────────────────────

const REQUISITION_STATUSES = new Set([
  "received.walk_in_test.requisition_created",
  "received.walk_in_test.patient_processed",
]);

// Specimen is at the lab; patient should see "your sample is being processed."
const SPECIMEN_COLLECTED_STATUSES = new Set([
  "received.walk_in_test.specimen_collected",
  "completed.walk_in_test.specimen_with_lab",
]);

// Results have been produced and are ready for the patient to view.
const RESULTS_READY_STATUSES = new Set([
  "completed.walk_in_test.completed",
  "completed.walk_in_test.partial_results",
]);

async function handleOrderUpdated(
  db: ReturnType<typeof createSupabaseAdminClient>,
  data: Record<string, unknown>
) {
  const junctionOrderId = data.id as string | undefined;
  const junctionStatus = data.status as string | undefined;
  if (!junctionOrderId || !junctionStatus) return;

  const { data: order } = await db
    .from("orders")
    .select("id, status, member_id")
    .eq("junction_order_id", junctionOrderId)
    .maybeSingle();

  if (!order) return;

  let nextStatus: OrderStatus | null = null;
  let auditAction: "order.requisition_ready" | null = null;

  if (REQUISITION_STATUSES.has(junctionStatus) && order.status === "order_placed") {
    nextStatus = "requisition_ready";
    auditAction = "order.requisition_ready";
  } else if (
    SPECIMEN_COLLECTED_STATUSES.has(junctionStatus) &&
    (order.status === "appointment_scheduled" || order.status === "requisition_ready")
  ) {
    nextStatus = "specimen_collected";
  } else if (RESULTS_READY_STATUSES.has(junctionStatus) && order.status !== "results_ready") {
    nextStatus = "results_ready";
  }

  if (!nextStatus) return;

  await db
    .from("orders")
    .update({ status: nextStatus })
    .eq("id", order.id)
    .eq("status", order.status);

  if (nextStatus === "results_ready") {
    await upsertResultsRow(db, order.id, "ready", junctionOrderId);
  }

  if (auditAction) {
    try {
      await writeAuditLog({
        actor: "webhook",
        action: auditAction,
        resource: `orders/${order.id}`,
        memberId: order.member_id,
        ipAddress: null,
      });
    } catch (err) {
      // Must not 500 here — Junction would retry the webhook
      console.error("[junction/webhook] audit log failed:", err instanceof Error ? err.message : err);
    }
  }
}

async function handleResultCritical(
  db: ReturnType<typeof createSupabaseAdminClient>,
  data: Record<string, unknown>
) {
  // The event data may contain the order ID directly or nested under an order object.
  const junctionOrderId =
    (data.id as string | undefined) ??
    ((data.order as Record<string, unknown> | undefined)?.id as string | undefined);

  if (!junctionOrderId) {
    console.error("[junction/webhook] labtest.result.critical: no order ID in payload");
    return;
  }

  const { data: order } = await db
    .from("orders")
    .select("id, status, member_id")
    .eq("junction_order_id", junctionOrderId)
    .maybeSingle();

  if (!order) return;

  await db
    .from("orders")
    .update({ status: "results_concerning" })
    .eq("id", order.id)
    .neq("status", "results_concerning"); // idempotent

  await upsertResultsRow(db, order.id, "concerning", junctionOrderId);
}

async function upsertResultsRow(
  db: ReturnType<typeof createSupabaseAdminClient>,
  orderId: string,
  status: "ready" | "concerning",
  junctionOrderId: string
) {
  // junction_result_id stores the junction order ID — results are fetched via
  // GET /v3/order/{junction_order_id}/result, so we need the order ID, not a separate result ID.
  const { error } = await db.from("results").upsert(
    { order_id: orderId, status, junction_result_id: junctionOrderId },
    { onConflict: "order_id" }
  );
  if (error) {
    console.error("[junction/webhook] results upsert failed:", error.message);
  }
}
