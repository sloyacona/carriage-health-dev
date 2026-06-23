import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { junction } from "@/lib/junction";
import { writeAuditLog } from "@/lib/audit-log";
import {
  isJunctionSafeName,
  JUNCTION_NAME_ERROR,
  normalizeUsPhone,
} from "@/lib/validate-junction-name";

const LAB_TEST_ID = process.env.JUNCTION_LAB_TEST_ID!;

// ── Payload shape sent by the client ─────────────────────────────────────────
interface SubmitPayload {
  firstName: string;
  lastName: string;
  dob: string; // MM/DD/YYYY from client
  phone: string;
  biologicalSex: "male" | "female";
  address: { street: string; city: string; state: string; zip: string };
  healthContext: { journeyStage: string[]; lossCount: string; supplements: string };
  consents: { hipaaAuthorization: boolean; termsOfUse: boolean; telehealthConsent: boolean };
}

// ── Convert MM/DD/YYYY → YYYY-MM-DD for Junction ─────────────────────────────
function parseDob(raw: string): string | null {
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, m, d, y] = match;
  const month = m.padStart(2, "0");
  const day = d.padStart(2, "0");
  // Basic sanity: year 1900–2100, month 01–12, day 01–31
  if (
    parseInt(y) < 1900 || parseInt(y) > 2100 ||
    parseInt(month) < 1 || parseInt(month) > 12 ||
    parseInt(day) < 1 || parseInt(day) > 31
  ) return null;
  return `${y}-${month}-${day}`;
}

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: SubmitPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const db = createSupabaseAdminClient();

  // ── Look up member ────────────────────────────────────────────────────────
  const { data: member, error: memberError } = await db
    .from("members")
    .select("id, email")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (memberError || !member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // ── Verify there is an intake_pending order ───────────────────────────────
  const { data: order, error: orderError } = await db
    .from("orders")
    .select("id, status, junction_order_id")
    .eq("member_id", member.id)
    .eq("status", "intake_pending")
    .limit(1)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json(
      { error: "No intake_pending order found for this account." },
      { status: 409 }
    );
  }

  // ── Server-side name validation (guardrail #11) ───────────────────────────
  if (!isJunctionSafeName(payload.firstName)) {
    return NextResponse.json({ error: `First name: ${JUNCTION_NAME_ERROR}` }, { status: 422 });
  }
  if (!isJunctionSafeName(payload.lastName)) {
    return NextResponse.json({ error: `Last name: ${JUNCTION_NAME_ERROR}` }, { status: 422 });
  }

  // ── Phone + DOB format checks ─────────────────────────────────────────────
  const phone = normalizeUsPhone(payload.phone);
  if (!phone) {
    return NextResponse.json(
      { error: "Please enter a valid 10-digit US phone number." },
      { status: 422 }
    );
  }

  const dob = parseDob(payload.dob);
  if (!dob) {
    return NextResponse.json(
      { error: "Please enter your date of birth as MM/DD/YYYY." },
      { status: 422 }
    );
  }

  // ── Require all three consents ────────────────────────────────────────────
  if (
    !payload.consents.hipaaAuthorization ||
    !payload.consents.termsOfUse ||
    !payload.consents.telehealthConsent
  ) {
    return NextResponse.json(
      { error: "All three consent checkboxes are required." },
      { status: 422 }
    );
  }

  // ── Persist consent records (guardrail #8) ────────────────────────────────
  // Consents are recorded before the Junction call because consent is a legal act
  // independent of Junction's success — but we dedup so retries don't create duplicates.
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;

  const { data: existingConsents } = await db
    .from("consents")
    .select("consent_type")
    .eq("member_id", member.id)
    .eq("version", "1.0");

  const alreadyRecorded = new Set(existingConsents?.map((c) => c.consent_type) ?? []);

  const consentRows = [
    { member_id: member.id, consent_type: "hipaa-authorization",         version: "1.0", ip_address: ipAddress },
    { member_id: member.id, consent_type: "terms-of-use",                version: "1.0", ip_address: ipAddress },
    { member_id: member.id, consent_type: "telehealth-informed-consent", version: "1.0", ip_address: ipAddress },
  ].filter((r) => !alreadyRecorded.has(r.consent_type));

  if (consentRows.length > 0) {
    const { error: consentError } = await db.from("consents").insert(consentRows);
    if (consentError) {
      console.error("[intake/submit] consent insert failed:", consentError.message);
      return NextResponse.json(
        { error: "Failed to record consents. Please try again." },
        { status: 500 }
      );
    }
  }

  // ── Persist intake_data to the order (before Junction call so retry is safe) ──
  const intakeData = {
    firstName: payload.firstName,
    lastName: payload.lastName,
    dateOfBirth: dob,
    phone: payload.phone,
    biologicalSex: payload.biologicalSex,
    address: payload.address,
    healthContext: payload.healthContext,
    submittedAt: new Date().toISOString(),
  };

  const { error: intakeUpdateError } = await db
    .from("orders")
    .update({ intake_data: intakeData })
    .eq("id", order.id);

  if (intakeUpdateError) {
    console.error("[intake/submit] intake_data update failed:", intakeUpdateError.message);
    return NextResponse.json(
      { error: "Failed to save your information. Please try again." },
      { status: 500 }
    );
  }

  // ── Get Junction user ID for this member ─────────────────────────────────
  // We pass junction_user_id to the order (guardrail #6: client_user_id stays opaque).
  const { data: junctionUser, error: juError } = await db
    .from("junction_users")
    .select("junction_user_id")
    .eq("member_id", member.id)
    .single();

  if (juError || !junctionUser) {
    console.error("[intake/submit] junction_users lookup failed:", juError?.message);
    return NextResponse.json(
      { error: "Account configuration error. Please contact support." },
      { status: 500 }
    );
  }

  // ── Idempotency guard: skip Junction if a prior attempt already placed the order ──
  // This covers the failure window where Junction succeeded but our DB update errored.
  if (order.junction_order_id) {
    await db
      .from("orders")
      .update({ status: "order_placed", lab_test_id: LAB_TEST_ID })
      .eq("id", order.id);
    return NextResponse.json({ ok: true });
  }

  // ── Place the Junction order (server-side, sandbox, physician block omitted) ──
  let junctionOrderId: string;
  try {
    const junctionResponse = await junction.createOrder({
      user_id: junctionUser.junction_user_id,
      lab_test_id: LAB_TEST_ID,
      patient_details: {
        first_name: payload.firstName,
        last_name: payload.lastName,
        dob,
        gender: payload.biologicalSex,
        phone_number: phone,
        // email is PHI on a medical order (not the identifier guardrail #6 protects).
        // Junction requires it for order confirmation and physician-network communication.
        // Covered by the Junction BAA (action item B in CLAUDE.md).
        email: member.email,
      },
      patient_address: {
        first_line: payload.address.street,
        city: payload.address.city,
        state: payload.address.state,
        zip: payload.address.zip,   // Junction expects "zip", not "zip_code"
        country: "US",
      },
      // consents intentionally omitted from Junction payload (stored in our consents table)
    });

    // Junction wraps the created order in an "order" key: { order: { id: "..." }, status: "success" }
    junctionOrderId = junctionResponse.order?.id;
    if (!junctionOrderId) {
      throw new Error("Junction response missing order.id: " + JSON.stringify(junctionResponse));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[intake/submit] Junction createOrder failed:", message);

    // Never surface the raw Junction error to the patient (guardrail #11)
    return NextResponse.json(
      {
        error:
          "We couldn't place your order with the lab right now. Your information has been saved — please try again in a moment. If this keeps happening, contact support.",
      },
      { status: 502 }
    );
  }

  // ── Advance order status → order_placed ──────────────────────────────────
  const { error: statusError } = await db
    .from("orders")
    .update({
      junction_order_id: junctionOrderId,
      lab_test_id: LAB_TEST_ID,
      status: "order_placed",
    })
    .eq("id", order.id);

  if (statusError) {
    // Order placed at Junction but DB update failed. Log and flag for manual reconciliation.
    console.error(
      "[intake/submit] CRITICAL: Junction order placed but DB status update failed.",
      { junctionOrderId, orderId: order.id, error: statusError.message }
    );
    // Still return success — the order exists at Junction; status will reconcile via webhook.
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  try {
    await writeAuditLog({
      actor: member.id,
      action: "order.create",
      resource: `orders/${order.id}`,
      memberId: member.id,
      ipAddress,
    });
  } catch (err) {
    console.error("[intake/submit] audit log failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ok: true });
}
