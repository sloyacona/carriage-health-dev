"use client";

import { useState, useEffect } from "react";
import type { ResultsData, BiomarkerResult, OrderStatus } from "@/types";

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

function formatRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return "—";
  if (min === null) return `≤ ${max}`;
  if (max === null) return `≥ ${min}`;
  return `${min}–${max}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PhysicianNoteCard({
  note,
  name,
  reviewedAt,
  concerning,
}: {
  note: string;
  name: string | null;
  reviewedAt: string | null;
  concerning: boolean;
}) {
  return (
    <div
      className={`rounded-3xl p-6 space-y-3 ${
        concerning
          ? "border-l-4 border-amber bg-linen border border-l-amber border-r-border border-t-border border-b-border"
          : "bg-champagne border border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p
          className={`text-xs font-medium tracking-widest uppercase ${
            concerning ? "text-amber" : "text-sage"
          }`}
        >
          Physician&apos;s note
        </p>
        {reviewedAt && (
          <p className="text-xs text-muted shrink-0">
            Reviewed {formatDate(reviewedAt)}
          </p>
        )}
      </div>
      <p className="text-sm text-charcoal leading-relaxed">{note}</p>
      {name && (
        <p className="text-xs text-muted border-t border-border/60 pt-3">{name}</p>
      )}
    </div>
  );
}

function ConsultCallout() {
  return (
    <div className="rounded-3xl border border-amber/40 bg-amber/5 p-5 space-y-2">
      <p className="text-sm font-medium text-charcoal">
        We&rsquo;re here if you have questions.
      </p>
      <p className="text-sm text-muted leading-relaxed">
        Your physician has noted some values worth discussing with a specialist. If
        you&rsquo;d like support navigating next steps, reach out to us at{" "}
        <a
          href="mailto:support@carriagehealth.co"
          className="text-charcoal underline underline-offset-2 hover:text-charcoal/70 transition-colors"
        >
          support@carriagehealth.co
        </a>
        .
      </p>
    </div>
  );
}

function BiomarkerRow({ marker }: { marker: BiomarkerResult }) {
  const flagged = marker.isAboveMax || marker.isBelowMin;
  const flag = marker.isAboveMax ? "↑" : marker.isBelowMin ? "↓" : null;

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4 text-sm font-medium text-charcoal">{marker.name}</td>
      <td
        className={`py-3 pr-4 text-sm tabular-nums ${
          flagged ? "text-amber font-medium" : "text-charcoal"
        }`}
      >
        {marker.value !== null ? marker.value : "—"}
        {marker.unit && (
          <span className="ml-1 text-xs text-muted font-normal">{marker.unit}</span>
        )}
      </td>
      <td className="py-3 pr-4 text-sm text-muted tabular-nums">
        {formatRange(marker.minRange, marker.maxRange)}
        {marker.unit && (
          <span className="ml-1 text-xs text-muted/70">{marker.unit}</span>
        )}
      </td>
      <td className="py-3 text-right">
        {flag && (
          <span className="text-sm font-medium text-amber" aria-label={marker.isAboveMax ? "Above reference range" : "Below reference range"}>
            {flag}
          </span>
        )}
      </td>
    </tr>
  );
}

function MarkersTable({ markers }: { markers: BiomarkerResult[] }) {
  return (
    <div className="rounded-3xl border border-border bg-white overflow-hidden">
      <div className="px-6 pt-5 pb-2">
        <h2 className="font-serif text-lg text-charcoal">Your markers</h2>
        <p className="text-xs text-muted mt-1">
          Reference ranges are provided by the lab. ↑ and ↓ indicate values outside the range.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-linen/50">
              <th className="px-6 py-2 text-left text-xs font-medium text-muted uppercase tracking-wide">
                Marker
              </th>
              <th className="px-0 pr-4 py-2 text-left text-xs font-medium text-muted uppercase tracking-wide">
                Your result
              </th>
              <th className="pr-4 py-2 text-left text-xs font-medium text-muted uppercase tracking-wide">
                Reference range
              </th>
              <th className="pr-6 py-2" aria-hidden="true" />
            </tr>
          </thead>
          <tbody className="px-6">
            {markers.map((marker, i) => (
              <tr key={i} className={`border-b border-border last:border-0 ${i % 2 === 1 ? "bg-linen/30" : ""}`}>
                <td className="px-6 py-3 text-sm font-medium text-charcoal">{marker.name}</td>
                <td
                  className={`pr-4 py-3 text-sm tabular-nums ${
                    marker.isAboveMax || marker.isBelowMin ? "text-amber font-medium" : "text-charcoal"
                  }`}
                >
                  {marker.value !== null ? marker.value : "—"}
                  {marker.unit && (
                    <span className="ml-1 text-xs text-muted font-normal">{marker.unit}</span>
                  )}
                </td>
                <td className="pr-4 py-3 text-sm text-muted tabular-nums">
                  {formatRange(marker.minRange, marker.maxRange)}
                  {marker.unit && (
                    <span className="ml-1 text-xs text-muted/70">{marker.unit}</span>
                  )}
                </td>
                <td className="pr-6 py-3 text-right w-8">
                  {(marker.isAboveMax || marker.isBelowMin) && (
                    <span
                      className="text-sm font-medium text-amber"
                      aria-label={marker.isAboveMax ? "Above reference range" : "Below reference range"}
                    >
                      {marker.isAboveMax ? "↑" : "↓"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-36 rounded-3xl bg-linen animate-pulse" />
      <div className="h-64 rounded-3xl bg-linen animate-pulse" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ResultsDisplay({
  orderStatus,
  demoParam,
}: {
  orderStatus: OrderStatus;
  demoParam?: string;
}) {
  const [results, setResults] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isConcerning = orderStatus === "results_concerning";

  useEffect(() => {
    let cancelled = false;
    const url = demoParam ? `/api/results?demo=${demoParam}` : "/api/results";

    fetch(url)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body.error) {
          setError(body.error);
        } else {
          setResults(body.data as ResultsData);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Network error loading your results. Please refresh.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [demoParam]);

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <p className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 leading-relaxed">
        {error}
      </p>
    );
  }

  if (!results) return null;

  const effectivelyConcerning =
    isConcerning || results.interpretation === "abnormal" || results.interpretation === "critical";

  return (
    <div className="space-y-5">
      {/* Physician note — always first, per 21st Century Cures Act and product spec */}
      {results.physicianNote && (
        <PhysicianNoteCard
          note={results.physicianNote}
          name={results.physicianName}
          reviewedAt={results.reviewedAt}
          concerning={effectivelyConcerning}
        />
      )}

      {/* Consult offer — alongside results, never before them (guardrail: Cures Act) */}
      {effectivelyConcerning && <ConsultCallout />}

      {/* Lab values — raw biomarker data only; no Carriage-generated interpretation */}
      {results.markers.length > 0 && <MarkersTable markers={results.markers} />}

      {/* PDF download — proxied through our server for audit logging (guardrail #4) */}
      <div className="pt-2 pb-4 text-center">
        <a
          href="/api/results/pdf"
          className="text-sm text-muted underline underline-offset-2 hover:text-charcoal transition-colors"
        >
          Download your lab report (PDF)
        </a>
        <p className="text-xs text-muted/60 mt-1">
          This is the official lab report signed by the reviewing physician.
        </p>
      </div>
    </div>
  );
}
