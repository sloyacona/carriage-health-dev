import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit-log";

// Dev-only endpoint: fires Junction webhook logic without Svix signature verification.
// Hard-blocked in production. Use this during local development to simulate order/
// appointment/results status transitions without needing real Junction webhooks.
//
// Supported event_type values:
//
//   "labtest.order.updated"
//     advances order_placed → requisition_ready
//     Required: junction_order_id
//     Optional: status (defaults to "received.walk_in_test.requisition_created")
//
//   "labtest.appointment.created"
//     writes an appointments row and advances requisition_ready → appointment_scheduled
//     Required: junction_order_id
//     Optional: location_name, location_address, timezone, start_iso
//
//   "labtest.specimen.collected"
//     advances appointment_scheduled → specimen_collected
//     Required: junction_order_id
//
//   "labtest.result.ready"
//     advances any pre-results state → results_ready; inserts results row
//     Required: junction_order_id
//
//   "labtest.result.critical"
//     advances any pre-results state → results_concerning; inserts results row
//     Required: junction_order_id
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { event_type, junction_order_id, status } = body;

  if (!event_type || !junction_order_id) {
    return NextResponse.json(
      { error: "event_type and junction_order_id are required" },
      { status: 400 }
    );
  }

  const db = createSupabaseAdminClient();

  // ── labtest.order.updated — order_placed → requisition_ready ─────────────────
  if (event_type === "labtest.order.updated") {
    const junctionStatus = status ?? "received.walk_in_test.requisition_created";

    const REQUISITION_STATUSES = new Set([
      "received.walk_in_test.requisition_created",
      "received.walk_in_test.patient_processed",
    ]);

    if (!REQUISITION_STATUSES.has(junctionStatus)) {
      return NextResponse.json({
        message: `Status "${junctionStatus}" is not a requisition-ready trigger. Use "received.walk_in_test.requisition_created".`,
      });
    }

    const { data: order } = await db
      .from("orders")
      .select("id, status, member_id")
      .eq("junction_order_id", junction_order_id)
      .maybeSingle();

    if (!order) {
      return NextResponse.json(
        { error: `No order found with junction_order_id = ${junction_order_id}` },
        { status: 404 }
      );
    }

    if (order.status !== "order_placed") {
      return NextResponse.json({
        message: `Order is in status "${order.status}" — no transition applied.`,
        order_id: order.id,
      });
    }

    await db
      .from("orders")
      .update({ status: "requisition_ready" })
      .eq("id", order.id)
      .eq("status", "order_placed");

    try {
      await writeAuditLog({
        actor: "webhook",
        action: "order.requisition_ready",
        resource: `orders/${order.id}`,
        memberId: order.member_id,
        ipAddress: null,
      });
    } catch (err) {
      console.error("[simulate-webhook] audit log failed:", err instanceof Error ? err.message : err);
    }

    return NextResponse.json({
      ok: true,
      message: `Order ${order.id} advanced from order_placed → requisition_ready`,
    });
  }

  // ── labtest.appointment.created — requisition_ready → appointment_scheduled ──
  if (event_type === "labtest.appointment.created") {
    const { data: order } = await db
      .from("orders")
      .select("id, status, member_id")
      .eq("junction_order_id", junction_order_id)
      .maybeSingle();

    if (!order) {
      return NextResponse.json(
        { error: `No order found with junction_order_id = ${junction_order_id}` },
        { status: 404 }
      );
    }

    if (order.status !== "requisition_ready") {
      return NextResponse.json({
        message: `Order is in status "${order.status}" — must be requisition_ready to simulate appointment booking.`,
        order_id: order.id,
      });
    }

    const locationName = body.location_name ?? "Quest Diagnostics";
    const locationAddress = body.location_address ?? "3708 Jefferson Street, Suite B, Austin, TX 78731";
    const timezone = body.timezone ?? "America/Chicago";

    let startIso = body.start_iso;
    if (!startIso) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      startIso = tomorrow.toISOString();
    }

    const { error: apptError } = await db.from("appointments").insert({
      order_id: order.id,
      junction_appointment_id: `sim_${Date.now()}`,
      psc_location: locationName,
      psc_address: locationAddress,
      psc_timezone: timezone,
      scheduled_for: startIso,
      status: "scheduled",
    });

    if (apptError && apptError.code !== "23505") {
      return NextResponse.json({ error: apptError.message }, { status: 500 });
    }

    await db
      .from("orders")
      .update({ status: "appointment_scheduled" })
      .eq("id", order.id)
      .eq("status", "requisition_ready");

    try {
      await writeAuditLog({
        actor: "webhook",
        action: "appointment.book",
        resource: `orders/${order.id}`,
        memberId: order.member_id,
        ipAddress: null,
      });
    } catch (err) {
      console.error("[simulate-webhook] audit log failed:", err instanceof Error ? err.message : err);
    }

    return NextResponse.json({
      ok: true,
      message: `Order ${order.id} advanced from requisition_ready → appointment_scheduled`,
    });
  }

  // ── labtest.specimen.collected — appointment_scheduled → specimen_collected ───
  if (event_type === "labtest.specimen.collected") {
    const { data: order } = await db
      .from("orders")
      .select("id, status, member_id")
      .eq("junction_order_id", junction_order_id)
      .maybeSingle();

    if (!order) {
      return NextResponse.json(
        { error: `No order found with junction_order_id = ${junction_order_id}` },
        { status: 404 }
      );
    }

    if (order.status !== "appointment_scheduled") {
      return NextResponse.json({
        message: `Order is in status "${order.status}" — expected appointment_scheduled.`,
        order_id: order.id,
      });
    }

    await db
      .from("orders")
      .update({ status: "specimen_collected" })
      .eq("id", order.id)
      .eq("status", "appointment_scheduled");

    return NextResponse.json({
      ok: true,
      message: `Order ${order.id} advanced from appointment_scheduled → specimen_collected`,
    });
  }

  // ── labtest.result.ready — any pre-results state → results_ready ─────────────
  if (event_type === "labtest.result.ready") {
    const { data: order } = await db
      .from("orders")
      .select("id, status, member_id")
      .eq("junction_order_id", junction_order_id)
      .maybeSingle();

    if (!order) {
      return NextResponse.json(
        { error: `No order found with junction_order_id = ${junction_order_id}` },
        { status: 404 }
      );
    }

    if (order.status === "results_ready" || order.status === "results_concerning") {
      return NextResponse.json({
        message: `Order is already in status "${order.status}" — no transition applied.`,
        order_id: order.id,
      });
    }

    await db
      .from("orders")
      .update({ status: "results_ready" })
      .eq("id", order.id);

    const { error: resError } = await db.from("results").upsert(
      { order_id: order.id, status: "ready", junction_result_id: `sim_${Date.now()}` },
      { onConflict: "order_id" }
    );
    if (resError) {
      console.error("[simulate-webhook] results upsert failed:", resError.message);
    }

    return NextResponse.json({
      ok: true,
      message: `Order ${order.id} advanced to results_ready. Results row inserted with sim_ ID.`,
      hint: "Visit /results?demo=normal to preview the results page without real Junction data.",
    });
  }

  // ── labtest.result.critical — any pre-results state → results_concerning ──────
  if (event_type === "labtest.result.critical") {
    const { data: order } = await db
      .from("orders")
      .select("id, status, member_id")
      .eq("junction_order_id", junction_order_id)
      .maybeSingle();

    if (!order) {
      return NextResponse.json(
        { error: `No order found with junction_order_id = ${junction_order_id}` },
        { status: 404 }
      );
    }

    if (order.status === "results_concerning") {
      return NextResponse.json({
        message: `Order is already in status "results_concerning" — no transition applied.`,
        order_id: order.id,
      });
    }

    await db
      .from("orders")
      .update({ status: "results_concerning" })
      .eq("id", order.id);

    const { error: resError } = await db.from("results").upsert(
      { order_id: order.id, status: "concerning", junction_result_id: `sim_${Date.now()}` },
      { onConflict: "order_id" }
    );
    if (resError) {
      console.error("[simulate-webhook] results upsert failed:", resError.message);
    }

    return NextResponse.json({
      ok: true,
      message: `Order ${order.id} advanced to results_concerning. Results row inserted with sim_ ID.`,
      hint: "Visit /results?demo=concerning to preview the results page without real Junction data.",
    });
  }

  return NextResponse.json({
    message: `event_type "${event_type}" has no simulator — no-op.`,
  });
}
