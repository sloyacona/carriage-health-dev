import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { junction } from "@/lib/junction";
import { writeAuditLog } from "@/lib/audit-log";
import type { ResultsData, BiomarkerResult } from "@/types";

// ── Synthetic data for sandbox / demo testing ─────────────────────────────────
// Used when: (a) junction_result_id starts with "sim_", or (b) NODE_ENV !== "production"
// and ?demo=normal|concerning is in the request. Never served in production for real orders.

const DEMO_PHYSICIAN = { first_name: "Maria", last_name: "Chen" };
const DEMO_REVIEWED_AT = new Date().toISOString();

const DEMO_MARKERS_BASE: BiomarkerResult[] = [
  { name: "FSH",                    value: 6.8,  unit: "IU/L",   minRange: 3.0,  maxRange: 20.0,  isAboveMax: false, isBelowMin: false },
  { name: "LH",                     value: 7.2,  unit: "IU/L",   minRange: 2.0,  maxRange: 15.0,  isAboveMax: false, isBelowMin: false },
  { name: "AMH",                    value: 2.4,  unit: "ng/mL",  minRange: 1.0,  maxRange: 3.5,   isAboveMax: false, isBelowMin: false },
  { name: "Estradiol (E2)",         value: 58,   unit: "pg/mL",  minRange: 12.5, maxRange: 166.0, isAboveMax: false, isBelowMin: false },
  { name: "Progesterone",           value: 0.8,  unit: "ng/mL",  minRange: 0.1,  maxRange: 0.9,   isAboveMax: false, isBelowMin: false },
  { name: "Prolactin",              value: 12.3, unit: "ng/mL",  minRange: 4.8,  maxRange: 23.3,  isAboveMax: false, isBelowMin: false },
  { name: "TSH",                    value: 1.8,  unit: "mIU/L",  minRange: 0.4,  maxRange: 4.0,   isAboveMax: false, isBelowMin: false },
  { name: "Free T4",                value: 1.2,  unit: "ng/dL",  minRange: 0.8,  maxRange: 1.8,   isAboveMax: false, isBelowMin: false },
  { name: "Total Testosterone",     value: 32,   unit: "ng/dL",  minRange: 8.0,  maxRange: 60.0,  isAboveMax: false, isBelowMin: false },
  { name: "DHEA-S",                 value: 178,  unit: "µg/dL",  minRange: 44.0, maxRange: 332.0, isAboveMax: false, isBelowMin: false },
  { name: "Vitamin D (25-OH)",      value: 42,   unit: "ng/mL",  minRange: 30.0, maxRange: 100.0, isAboveMax: false, isBelowMin: false },
  { name: "HbA1c",                  value: 5.2,  unit: "%",      minRange: 4.0,  maxRange: 5.6,   isAboveMax: false, isBelowMin: false },
];

const DEMO_NORMAL: ResultsData = {
  interpretation: "normal",
  physicianName: `Dr. ${DEMO_PHYSICIAN.first_name} ${DEMO_PHYSICIAN.last_name}`,
  physicianNote:
    "I reviewed your Carriage Reproductive Panel. Your hormone levels are all within " +
    "normal reference ranges, which is encouraging. Your AMH is in a healthy range for " +
    "your age, suggesting a good ovarian reserve, and your thyroid is functioning well. " +
    "These results don't show any obvious hormonal contributors to pregnancy loss. I " +
    "recommend discussing them with your OB-GYN or a reproductive endocrinologist " +
    "alongside your full medical and pregnancy history.",
  reviewedAt: DEMO_REVIEWED_AT,
  markers: DEMO_MARKERS_BASE,
};

const DEMO_CONCERNING: ResultsData = {
  interpretation: "abnormal",
  physicianName: `Dr. ${DEMO_PHYSICIAN.first_name} ${DEMO_PHYSICIAN.last_name}`,
  physicianNote:
    "I reviewed your Carriage Reproductive Panel. Most of your hormone levels are " +
    "within normal ranges, and I want to share two values worth discussing with a " +
    "specialist. Your TSH is mildly elevated — thyroid function is closely tied to " +
    "pregnancy outcomes, and even subtle changes can matter. Your AMH is slightly " +
    "below the reference range for your age group, which may reflect a somewhat " +
    "reduced ovarian reserve. Neither of these findings automatically explains " +
    "pregnancy loss, but they are meaningful data points. I'd encourage you to " +
    "bring these results to your OB-GYN or reproductive endocrinologist.",
  reviewedAt: DEMO_REVIEWED_AT,
  markers: [
    ...DEMO_MARKERS_BASE.slice(0, 2),
    { name: "AMH",    value: 0.85, unit: "ng/mL", minRange: 1.0, maxRange: 3.5,  isAboveMax: false, isBelowMin: true  },
    ...DEMO_MARKERS_BASE.slice(3, 6),
    { name: "TSH",    value: 5.2,  unit: "mIU/L", minRange: 0.4, maxRange: 4.0,  isAboveMax: true,  isBelowMin: false },
    ...DEMO_MARKERS_BASE.slice(7),
  ],
};

// ── Junction response → ResultsData normalizer ────────────────────────────────

function normalize(raw: Record<string, unknown>): ResultsData {
  const physician = raw.physician as Record<string, string> | undefined;
  const physicianName = physician
    ? `Dr. ${physician.first_name ?? ""} ${physician.last_name ?? ""}`.trim()
    : null;

  const rawMarkers = (raw.results as Array<Record<string, unknown>> | undefined) ?? [];
  const markers: BiomarkerResult[] = rawMarkers.map((m) => ({
    name:        (m.name as string) ?? (m.slug as string) ?? "Unknown",
    value:       (m.value as number | null) ?? null,
    unit:        (m.unit as string | null) ?? null,
    minRange:    (m.min_range_value as number | null) ?? null,
    maxRange:    (m.max_range_value as number | null) ?? null,
    isAboveMax:  Boolean(m.is_above_max_range),
    isBelowMin:  Boolean(m.is_below_min_range),
  }));

  return {
    interpretation: (raw.interpretation as "normal" | "abnormal" | "critical") ?? "normal",
    physicianNote:  (raw.physician_note as string | null) ?? null,
    physicianName,
    reviewedAt:     (raw.created_at as string | null) ?? null,
    markers,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const demo = request.nextUrl.searchParams.get("demo");
  const isDevDemo =
    process.env.NODE_ENV !== "production" &&
    (demo === "normal" || demo === "concerning");

  // ── Dev demo path: return synthetic data without touching the DB ─────────────
  if (isDevDemo) {
    const data: ResultsData = demo === "concerning" ? DEMO_CONCERNING : DEMO_NORMAL;
    return NextResponse.json({ ok: true, data });
  }

  const db = createSupabaseAdminClient();

  const { data: member } = await db
    .from("members")
    .select("id")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Confirm the patient has a results-ready order
  const { data: order } = await db
    .from("orders")
    .select("id, status, junction_order_id")
    .eq("member_id", member.id)
    .in("status", ["results_ready", "results_concerning"])
    .maybeSingle();

  if (!order || !order.junction_order_id) {
    return NextResponse.json({ error: "No results available for this account." }, { status: 404 });
  }

  // Confirm a results row exists (written by the webhook)
  const { data: resultRow } = await db
    .from("results")
    .select("id, junction_result_id")
    .eq("order_id", order.id)
    .maybeSingle();

  // ── Sim path: sim_ junction_result_id in dev mode → return synthetic data ────
  if (
    process.env.NODE_ENV !== "production" &&
    resultRow?.junction_result_id?.startsWith("sim_")
  ) {
    const data: ResultsData =
      order.status === "results_concerning" ? DEMO_CONCERNING : DEMO_NORMAL;
    return NextResponse.json({ ok: true, data });
  }

  // ── Real path: fetch from Junction, write audit log ───────────────────────────
  let raw: Record<string, unknown>;
  try {
    raw = await junction.getResult(order.junction_order_id);
  } catch (err) {
    console.error("[api/results] Junction getResult failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "We couldn't retrieve your results right now. Please try again in a moment." },
      { status: 502 }
    );
  }

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  try {
    await writeAuditLog({
      actor: member.id,
      action: "result.view",
      resource: `orders/${order.id}`,
      memberId: member.id,
      ipAddress,
    });
  } catch (err) {
    console.error("[api/results] audit log failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ok: true, data: normalize(raw) });
}
