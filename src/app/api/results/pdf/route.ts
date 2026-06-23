import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { junction } from "@/lib/junction";
import { writeAuditLog } from "@/lib/audit-log";

// Proxies the lab report PDF through our server so every access is audit-logged
// before the patient is redirected to Junction's signed URL (guardrail #4).
export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createSupabaseAdminClient();

  const { data: member } = await db
    .from("members")
    .select("id")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const { data: order } = await db
    .from("orders")
    .select("id, junction_order_id")
    .eq("member_id", member.id)
    .in("status", ["results_ready", "results_concerning"])
    .maybeSingle();

  if (!order || !order.junction_order_id) {
    return NextResponse.json({ error: "No results available." }, { status: 404 });
  }

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // Audit the access before fetching — the log is the record that the patient
  // requested their report, regardless of whether the download completes.
  try {
    await writeAuditLog({
      actor: member.id,
      action: "result.pdf.view",
      resource: `orders/${order.id}`,
      memberId: member.id,
      ipAddress,
    });
  } catch (err) {
    console.error("[api/results/pdf] audit log failed:", err instanceof Error ? err.message : err);
  }

  // ── Dev / sim path ──────────────────────────────────────────────────────────
  const { data: resultRow } = await db
    .from("results")
    .select("junction_result_id")
    .eq("order_id", order.id)
    .maybeSingle();

  if (
    process.env.NODE_ENV !== "production" &&
    resultRow?.junction_result_id?.startsWith("sim_")
  ) {
    return NextResponse.json(
      { error: "Lab report PDF is not available in demo mode. It will be provided for real orders." },
      { status: 404 }
    );
  }

  // ── Real path: get signed URL from Junction and redirect ────────────────────
  let pdfResponse: { url?: string };
  try {
    pdfResponse = await junction.getResultPdfUrl(order.junction_order_id);
  } catch (err) {
    console.error("[api/results/pdf] Junction getResultPdfUrl failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "We couldn't retrieve your lab report right now. Please try again." },
      { status: 502 }
    );
  }

  if (!pdfResponse?.url) {
    return NextResponse.json(
      { error: "Lab report URL not available from Junction." },
      { status: 502 }
    );
  }

  return NextResponse.redirect(pdfResponse.url);
}
