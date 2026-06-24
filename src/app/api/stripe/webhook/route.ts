import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit-log";

// Stripe requires the raw request body to verify the signature.
// Next.js App Router does NOT auto-parse route handler bodies, so request.text()
// returns the raw bytes Stripe signed.
export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("[webhook] Signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const orderId = pi.metadata?.order_id;
    const memberId = pi.metadata?.member_id;

    if (!orderId || !memberId) {
      console.error("[webhook] Missing metadata on payment_intent", pi.id);
      return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
    }

    const db = createSupabaseAdminClient();

    // Insert the payment record. The unique constraint on stripe_payment_intent_id
    // makes this naturally idempotent — duplicate webhooks return 23505 and we return 200.
    const { error: paymentError } = await db.from("payments").insert({
      member_id: memberId,
      order_id: orderId,
      stripe_payment_intent_id: pi.id,
      amount: pi.amount,
      status: "succeeded",
    });

    if (paymentError) {
      if (paymentError.code === "23505") {
        // Already processed this event — safe to ack
        return NextResponse.json({ received: true });
      }
      console.error("[webhook] payments insert failed:", paymentError.message);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    // Advance the order — only moves if still payment_pending (idempotent)
    await db
      .from("orders")
      .update({ status: "intake_pending" })
      .eq("id", orderId)
      .eq("status", "payment_pending");

    try {
      await writeAuditLog({
        actor: "webhook",
        action: "payment.succeeded",
        resource: `orders/${orderId}`,
        memberId,
        ipAddress: null,
      });
    } catch (err) {
      // Audit failure must not cause a 500 here — Stripe would retry and double-charge
      console.error("[webhook] audit log failed:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ received: true });
}
