import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { stripe, PANEL_PRICE_CENTS } from "@/lib/stripe";
import { writeAuditLog } from "@/lib/audit-log";

export async function POST() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createSupabaseAdminClient();

  // Look up this member's internal ID
  const { data: member, error: memberError } = await db
    .from("members")
    .select("id")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (memberError || !member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Check for an existing active order
  const { data: existingOrders } = await db
    .from("orders")
    .select("id, status")
    .eq("member_id", member.id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1);

  const existing = existingOrders?.[0] ?? null;

  // Already paid — redirect to dashboard instead of creating a duplicate
  if (existing && existing.status !== "payment_pending") {
    return NextResponse.json({ redirect: "/dashboard" });
  }

  // Reuse an existing payment_pending order or create a new one
  let orderId: string;
  if (existing?.status === "payment_pending") {
    orderId = existing.id;
  } else {
    const { data: newOrder, error: orderError } = await db
      .from("orders")
      .insert({ member_id: member.id })
      .select("id")
      .single();

    if (orderError || !newOrder) {
      console.error("[create-payment-intent] order insert failed:", orderError?.message);
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
    }

    orderId = newOrder.id;

    await writeAuditLog({
      actor: member.id,
      action: "order.create",
      resource: `orders/${orderId}`,
      memberId: member.id,
    });
  }

  // Create the Stripe Payment Intent — secret key stays server-side; client only
  // receives the client_secret, which is scoped to this payment only.
  const paymentIntent = await stripe.paymentIntents.create({
    amount: PANEL_PRICE_CENTS,
    currency: "usd",
    // Stored in PI metadata so the webhook can look up the order without a DB round-trip
    metadata: { order_id: orderId, member_id: member.id },
  });

  return NextResponse.json({ clientSecret: paymentIntent.client_secret });
}
