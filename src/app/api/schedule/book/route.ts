import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { junction } from "@/lib/junction";
import { writeAuditLog } from "@/lib/audit-log";

interface BookPayload {
  bookingKey: string;
  locationName: string;
  locationAddress: string;
  timezone: string;
  startIso: string;
}

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: BookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!payload.bookingKey) {
    return NextResponse.json({ error: "bookingKey is required" }, { status: 400 });
  }

  const db = createSupabaseAdminClient();

  const { data: member } = await db
    .from("members")
    .select("id")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const { data: order } = await db
    .from("orders")
    .select("id, status, junction_order_id")
    .eq("member_id", member.id)
    .eq("status", "requisition_ready")
    .maybeSingle();

  if (!order || !order.junction_order_id) {
    return NextResponse.json(
      { error: "No eligible order to schedule." },
      { status: 409 }
    );
  }

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // ── Place the booking with Junction ──────────────────────────────────────────
  let junctionAppointment: { id?: string; appointment_id?: string };
  try {
    junctionAppointment = await junction.bookAppointment(order.junction_order_id, {
      booking_key: payload.bookingKey,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[schedule/book] Junction bookAppointment failed:", message);

    const isSlotGone =
      message.toLowerCase().includes("no longer available") ||
      message.includes("409") ||
      message.includes("slot");

    return NextResponse.json(
      {
        error: isSlotGone
          ? "That slot was just taken. Please go back and choose a different time."
          : "We couldn't confirm your appointment right now. Your order is safe — please try again in a moment.",
      },
      { status: 502 }
    );
  }

  // Junction returns the appointment ID in `id`; fall back to booking_key so the
  // unique constraint on junction_appointment_id is always satisfied.
  const junctionAppointmentId =
    junctionAppointment.id ?? junctionAppointment.appointment_id ?? payload.bookingKey;

  // ── Persist the appointment ───────────────────────────────────────────────────
  const { error: apptError } = await db.from("appointments").insert({
    order_id: order.id,
    junction_appointment_id: junctionAppointmentId,
    psc_location: payload.locationName,
    psc_address: payload.locationAddress,
    psc_timezone: payload.timezone,
    scheduled_for: payload.startIso,
    status: "scheduled",
  });

  if (apptError) {
    if (apptError.code === "23505") {
      // Duplicate — a prior request already booked this slot. Still advance status.
    } else {
      console.error("[schedule/book] appointments insert failed:", apptError.message);
      return NextResponse.json(
        { error: "Failed to save your appointment. Please contact support." },
        { status: 500 }
      );
    }
  }

  // ── Advance order status ──────────────────────────────────────────────────────
  await db
    .from("orders")
    .update({ status: "appointment_scheduled" })
    .eq("id", order.id)
    .eq("status", "requisition_ready"); // idempotent guard

  // ── Audit log ────────────────────────────────────────────────────────────────
  try {
    await writeAuditLog({
      actor: member.id,
      action: "appointment.book",
      resource: `orders/${order.id}`,
      memberId: member.id,
      ipAddress,
    });
  } catch (err) {
    console.error(
      "[schedule/book] audit log failed:",
      err instanceof Error ? err.message : err
    );
  }

  return NextResponse.json({ ok: true });
}
