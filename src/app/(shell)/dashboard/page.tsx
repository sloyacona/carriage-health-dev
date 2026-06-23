import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/types";

type OrderRow = { id: string; status: OrderStatus };

type AppointmentRow = {
  psc_location: string;
  psc_address: string | null;
  psc_timezone: string | null;
  scheduled_for: string;
};

// ── Date/time formatting (server-side Intl is fine in Node) ──────────────────

function fmtDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(new Date(iso));
}

// ── Status card ───────────────────────────────────────────────────────────────

function PanelStatus({
  order,
  appointment,
}: {
  order: OrderRow | null;
  appointment: AppointmentRow | null;
}) {
  if (!order) {
    return (
      <div className="rounded-3xl border border-border bg-champagne p-6 space-y-4">
        <div>
          <p className="text-xs font-medium tracking-widest uppercase text-muted mb-1">
            The Carriage Reproductive Panel
          </p>
          <h2 className="font-serif text-xl text-charcoal">Ready when you are.</h2>
          <p className="mt-2 text-sm text-muted leading-relaxed">
            35+ reproductive markers, Quest walk-in draw, physician review — all in one
            panel.
          </p>
        </div>
        <Link
          href="/panel"
          className="inline-block rounded-2xl bg-charcoal px-6 py-3 text-sm font-medium text-white hover:bg-charcoal/90 transition-colors"
        >
          Get the Carriage Panel &rarr;
        </Link>
      </div>
    );
  }

  if (order.status === "payment_pending") {
    return (
      <div className="rounded-3xl border border-border bg-[#fbfbf7] p-6 space-y-2">
        <h2 className="font-serif text-xl text-charcoal">
          Your payment is processing&hellip;
        </h2>
        <p className="text-sm text-muted leading-relaxed">
          This usually takes just a moment. Refresh if this message persists.
        </p>
      </div>
    );
  }

  if (order.status === "intake_pending") {
    return (
      <div className="rounded-3xl border border-border bg-champagne p-6 space-y-4">
        <div>
          <p className="text-xs font-medium tracking-widest uppercase text-sage mb-1">
            Panel purchased
          </p>
          <h2 className="font-serif text-xl text-charcoal">Complete your intake form.</h2>
          <p className="mt-2 text-sm text-muted leading-relaxed">
            We need a few details before we can place your Quest order. It takes about 3
            minutes.
          </p>
        </div>
        <Link
          href="/intake"
          className="inline-block rounded-2xl bg-charcoal px-6 py-3 text-sm font-medium text-white hover:bg-charcoal/90 transition-colors"
        >
          Complete intake &rarr;
        </Link>
      </div>
    );
  }

  if (order.status === "order_placed") {
    return (
      <div className="rounded-3xl border border-border bg-[#fbfbf7] p-6 space-y-3">
        <p className="text-xs font-medium tracking-widest uppercase text-sage mb-1">
          Order placed
        </p>
        <h2 className="font-serif text-xl text-charcoal">We&rsquo;re preparing your order.</h2>
        <p className="text-sm text-muted leading-relaxed">
          Your lab order has been placed through Junction&rsquo;s physician network. Once
          the requisition is ready, you&rsquo;ll be able to schedule your Quest draw here.
          This typically takes a short time.
        </p>
      </div>
    );
  }

  if (order.status === "requisition_ready") {
    return (
      <div className="rounded-3xl border border-border bg-champagne p-6 space-y-4">
        <div>
          <p className="text-xs font-medium tracking-widest uppercase text-sage mb-1">
            Requisition ready
          </p>
          <h2 className="font-serif text-xl text-charcoal">
            Time to schedule your blood draw.
          </h2>
          <p className="mt-2 text-sm text-muted leading-relaxed">
            Your lab requisition is ready. Choose a Quest location and time that works for
            you — it&rsquo;s a quick visit, usually under ten minutes.
          </p>
        </div>
        <Link
          href="/schedule"
          className="inline-block rounded-2xl bg-charcoal px-6 py-3 text-sm font-medium text-white hover:bg-charcoal/90 transition-colors"
        >
          Schedule your draw &rarr;
        </Link>
      </div>
    );
  }

  if (order.status === "appointment_scheduled" && appointment) {
    const tz = appointment.psc_timezone ?? "America/New_York";
    return (
      <div className="rounded-3xl border border-border bg-[#fbfbf7] p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-champagne text-sage text-sm font-medium">
            ✓
          </span>
          <p className="text-xs font-medium tracking-widest uppercase text-sage">
            Appointment booked
          </p>
        </div>
        <div>
          <p className="font-serif text-xl text-charcoal">
            {fmtDate(appointment.scheduled_for, tz)} &middot;{" "}
            {fmtTime(appointment.scheduled_for, tz)}
          </p>
          <p className="mt-1 font-medium text-charcoal">{appointment.psc_location}</p>
          {appointment.psc_address && (
            <p className="text-sm text-muted">{appointment.psc_address}</p>
          )}
        </div>
        <p className="text-sm text-muted leading-relaxed">
          Bring a government-issued photo ID. No fasting required. Your results will appear
          here once the lab processes your sample.
        </p>
      </div>
    );
  }

  if (order.status === "specimen_collected") {
    return (
      <div className="rounded-3xl border border-border bg-[#fbfbf7] p-6 space-y-2">
        <p className="text-xs font-medium tracking-widest uppercase text-sage mb-1">
          Sample received
        </p>
        <h2 className="font-serif text-xl text-charcoal">Your sample is with the lab.</h2>
        <p className="text-sm text-muted leading-relaxed">
          Quest has sent your sample for analysis. Results typically take a few business
          days. You&rsquo;ll see them here as soon as they&rsquo;re ready.
        </p>
      </div>
    );
  }

  if (order.status === "results_pending") {
    return (
      <div className="rounded-3xl border border-border bg-[#fbfbf7] p-6 space-y-2">
        <p className="text-xs font-medium tracking-widest uppercase text-sage mb-1">
          Results incoming
        </p>
        <h2 className="font-serif text-xl text-charcoal">Your results are being processed.</h2>
        <p className="text-sm text-muted leading-relaxed">
          The lab has finished analysis and the physician is reviewing your results. This
          usually takes a short time. Check back shortly.
        </p>
      </div>
    );
  }

  if (order.status === "results_ready") {
    return (
      <div className="rounded-3xl border border-border bg-champagne p-6 space-y-4">
        <div>
          <p className="text-xs font-medium tracking-widest uppercase text-sage mb-1">
            Results ready
          </p>
          <h2 className="font-serif text-xl text-charcoal">We have your results.</h2>
          <p className="mt-2 text-sm text-muted leading-relaxed">
            Your Carriage Reproductive Panel has been reviewed by a physician. View your
            results now.
          </p>
        </div>
        <Link
          href="/results"
          className="inline-block rounded-2xl bg-charcoal px-6 py-3 text-sm font-medium text-white hover:bg-charcoal/90 transition-colors"
        >
          View your results &rarr;
        </Link>
      </div>
    );
  }

  if (order.status === "results_concerning") {
    return (
      <div className="rounded-3xl border border-amber/40 bg-amber/5 p-6 space-y-4">
        <div>
          <p className="text-xs font-medium tracking-widest uppercase text-amber mb-1">
            Results ready
          </p>
          <h2 className="font-serif text-xl text-charcoal">We have your results.</h2>
          <p className="mt-2 text-sm text-muted leading-relaxed">
            A few values are worth a closer look. Your physician&rsquo;s note is included
            alongside your results.
          </p>
        </div>
        <Link
          href="/results"
          className="inline-block rounded-2xl bg-charcoal px-6 py-3 text-sm font-medium text-white hover:bg-charcoal/90 transition-colors"
        >
          View your results &rarr;
        </Link>
      </div>
    );
  }

  // Catch-all for any future statuses
  return (
    <div className="rounded-3xl border border-border bg-[#fbfbf7] p-6 space-y-2">
      <p className="text-xs font-medium tracking-widest uppercase text-muted mb-1">
        Panel status
      </p>
      <h2 className="font-serif text-xl text-charcoal capitalize">
        {order.status.replace(/_/g, " ")}
      </h2>
      <p className="text-sm text-muted">
        Updates will appear here as your panel progresses.
      </p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: orders } = await supabase
    .from("orders")
    .select("id, status")
    .neq("status", "cancelled");

  // Prefer the order that has advanced past payment_pending.
  const order =
    ((orders?.find((o) => o.status !== "payment_pending") ??
      orders?.[0]) as OrderRow) ?? null;

  // Fetch appointment data if the order is at appointment_scheduled
  let appointment: AppointmentRow | null = null;
  if (order?.status === "appointment_scheduled") {
    const { data } = await supabase
      .from("appointments")
      .select("psc_location, psc_address, psc_timezone, scheduled_for")
      .eq("order_id", order.id)
      .eq("status", "scheduled")
      .maybeSingle();
    appointment = data ?? null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-charcoal">Your dashboard</h1>
        <p className="text-xs text-muted mt-1">{user?.email}</p>
      </div>

      <PanelStatus order={order} appointment={appointment} />
    </div>
  );
}
