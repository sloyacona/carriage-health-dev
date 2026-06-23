import Link from "next/link";
import Image from "next/image";

const BENEFITS = [
  "35+ reproductive markers — hormones, thyroid, clotting factors, and more",
  "Quest walk-in draw — no appointment needed at thousands of PSC locations",
  "Physician review included with every panel",
  "Plain-language results summary written for you, not your doctor",
];

export default function PanelPage() {
  return (
    <div className="space-y-8">
      {/* Eyebrow + heading */}
      <div>
        <p className="text-xs font-medium tracking-widest uppercase text-muted mb-3">
          The Carriage Reproductive Panel
        </p>
        <h1 className="font-serif text-3xl text-charcoal leading-snug">
          After pregnancy loss,
          <br />
          you deserve answers.
        </h1>
        <p className="mt-3 text-muted leading-relaxed">
          A comprehensive reproductive blood panel — reviewed by a physician
          and written in plain language, so you can finally understand what
          your body is telling you.
        </p>
      </div>

      {/* Product card */}
      <div className="overflow-hidden rounded-3xl border border-border bg-champagne">
        <div className="grid sm:grid-cols-[5fr_7fr]">
          {/* Hero image */}
          <div className="relative h-52 sm:h-auto">
            <Image
              src="/hero-linen.jpg"
              alt="A welcoming space with warm natural light"
              fill
              className="object-cover"
              priority
            />
          </div>

          {/* Panel details */}
          <div className="flex flex-col justify-between gap-6 p-6">
            <div>
              <h2 className="font-serif text-lg text-charcoal mb-4">
                What&apos;s included
              </h2>
              <ul className="space-y-3">
                {BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2.5 text-sm text-charcoal">
                    <span className="mt-0.5 shrink-0 text-sage font-medium">✓</span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-border/60 pt-4">
              <div className="flex items-baseline justify-between">
                <p className="font-serif text-2xl text-charcoal">$1,499</p>
                <p className="text-xs text-muted">one time · no insurance needed</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="space-y-3">
        <Link
          href="/checkout"
          className="block w-full rounded-2xl bg-charcoal py-4 text-center text-base font-medium text-white hover:bg-charcoal/90 transition-colors"
        >
          Purchase the Carriage Panel &rarr;
        </Link>
        <p className="text-center text-xs text-muted">
          Secure checkout &middot; paid in full today &middot; nothing billed later
        </p>
      </div>
    </div>
  );
}
