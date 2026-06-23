"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { SlotCard } from "@/types";

// ── Date/time formatting ──────────────────────────────────────────────────────

function formatDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function SlotSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-20 rounded-2xl border border-border bg-linen animate-pulse"
        />
      ))}
    </div>
  );
}

// ── Confirmation screen ───────────────────────────────────────────────────────

function Confirmed({ slot }: { slot: SlotCard }) {
  const router = useRouter();
  return (
    <div className="animate-in fade-in slide-in-from-bottom-3 duration-700 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-champagne text-sage text-2xl">
        ✓
      </div>
      <h2 className="mt-5 font-serif text-2xl text-charcoal">You&apos;re all set.</h2>
      <p className="mt-2 text-sm text-muted leading-relaxed max-w-xs mx-auto">
        Your Quest appointment is confirmed. No fasting required. Bring a
        government-issued photo ID.
      </p>

      <div className="mt-7 rounded-3xl border border-border bg-white p-6 text-left">
        <p className="text-xs font-medium tracking-widest uppercase text-muted">
          Your visit
        </p>
        <p className="mt-3 font-serif text-xl text-charcoal">
          {formatDate(slot.startIso, slot.timezone)} &middot;{" "}
          {formatTime(slot.startIso, slot.timezone)}
        </p>
        <p className="mt-1 font-medium text-charcoal">{slot.locationName}</p>
        <p className="text-sm text-muted">{slot.locationAddress}</p>
      </div>

      <button
        onClick={() => router.replace("/dashboard")}
        className="mt-6 w-full rounded-2xl bg-charcoal py-4 text-base font-medium text-white hover:bg-charcoal/90 transition-colors"
      >
        Go to my dashboard
      </button>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

export function ScheduleForm() {
  const [slots, setSlots] = useState<SlotCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SlotCard | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/schedule/availability")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setFetchError(data.error);
        } else {
          setSlots(data.slots ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) setFetchError("Network error loading appointments. Please refresh.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function handleConfirm() {
    if (!selected || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/schedule/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingKey: selected.bookingKey,
          locationName: selected.locationName,
          locationAddress: selected.locationAddress,
          timezone: selected.timezone,
          startIso: selected.startIso,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(
          data.error ?? "Something went wrong. Please try again."
        );
        setSubmitting(false);
        return;
      }
      setConfirmed(true);
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  }

  if (confirmed && selected) {
    return <Confirmed slot={selected} />;
  }

  if (loading) {
    return <SlotSkeleton />;
  }

  if (fetchError) {
    return (
      <p className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 leading-relaxed">
        {fetchError}
      </p>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-3xl border border-border bg-[#fbfbf7] p-6 space-y-2">
        <h2 className="font-serif text-xl text-charcoal">No slots available right now.</h2>
        <p className="text-sm text-muted leading-relaxed">
          We couldn&apos;t find open Quest appointments near your ZIP at the moment.
          Try refreshing in a few minutes, or call Quest directly:{" "}
          <span className="font-medium text-charcoal">1-888-277-8772</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {slots.map((slot) => {
          const isSelected = selected?.bookingKey === slot.bookingKey;
          return (
            <button
              key={slot.bookingKey}
              type="button"
              onClick={() => setSelected(slot)}
              className={`flex w-full items-center justify-between gap-4 rounded-2xl border p-5 text-left transition-all ${
                isSelected
                  ? "border-charcoal bg-champagne shadow-sm"
                  : "border-border bg-white hover:border-charcoal/40"
              }`}
            >
              <div className="min-w-0">
                <p className="font-medium text-charcoal truncate">{slot.locationName}</p>
                <p className="text-sm text-muted truncate">
                  {slot.locationAddress} &middot; {slot.distanceMiles} mi
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-serif text-lg text-charcoal">
                  {formatTime(slot.startIso, slot.timezone)}
                </p>
                <p className="text-xs text-muted">
                  {formatDate(slot.startIso, slot.timezone)}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {submitError && (
        <p className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 leading-relaxed">
          {submitError}
        </p>
      )}

      <button
        type="button"
        disabled={!selected || submitting}
        onClick={handleConfirm}
        className="w-full rounded-2xl bg-charcoal py-4 text-base font-medium text-white transition-colors hover:bg-charcoal/90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting
          ? "Confirming your appointment…"
          : selected
          ? "Confirm this appointment"
          : "Select a time to continue"}
      </button>
    </div>
  );
}
