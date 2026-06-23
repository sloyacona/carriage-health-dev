import "server-only";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { junction } from "@/lib/junction";
import type { SlotCard } from "@/types";

// ── Junction PSC availability response shape ──────────────────────────────────
interface JunctionSlotGroup {
  location: {
    name: string;
    distance: number;
    address: {
      first_line: string;
      city: string;
      state: string;
      zip_code: string;
    };
    iana_timezone: string;
  };
  date: string;
  slots: Array<{
    booking_key: string;
    start: string;
    num_appointments_available: number;
  }>;
}

const MAX_CARDS = 8;

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createSupabaseAdminClient();

  const { data: member } = await db
    .from("members")
    .select("id")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Only serve slots if the order is at requisition_ready
  const { data: order } = await db
    .from("orders")
    .select("id, intake_data")
    .eq("member_id", member.id)
    .eq("status", "requisition_ready")
    .maybeSingle();

  if (!order) {
    return NextResponse.json(
      { error: "No requisition-ready order found for this account." },
      { status: 409 }
    );
  }

  const zip =
    (order.intake_data as { address?: { zip?: string } } | null)?.address?.zip;

  if (!zip) {
    return NextResponse.json(
      { error: "No ZIP on file — unable to search for Quest locations." },
      { status: 409 }
    );
  }

  let raw: { slots?: JunctionSlotGroup[] };
  try {
    raw = await junction.getPscAvailability(zip, 25);
  } catch (err) {
    console.error(
      "[schedule/availability] Junction call failed:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Could not retrieve available appointments. Please try again in a moment." },
      { status: 502 }
    );
  }

  // Flatten nested location→day→slot structure into a flat list of SlotCards.
  const cards: SlotCard[] = [];
  for (const group of raw.slots ?? []) {
    const loc = group.location;
    const addr = `${loc.address.first_line}, ${loc.address.city}, ${loc.address.state} ${loc.address.zip_code}`;
    for (const slot of group.slots) {
      if (slot.num_appointments_available < 1) continue;
      cards.push({
        bookingKey: slot.booking_key,
        locationName: loc.name,
        locationAddress: addr,
        distanceMiles: Math.round(loc.distance * 10) / 10,
        startIso: slot.start,
        timezone: loc.iana_timezone,
      });
      if (cards.length >= MAX_CARDS) break;
    }
    if (cards.length >= MAX_CARDS) break;
  }

  return NextResponse.json({ slots: cards });
}
