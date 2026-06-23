"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isJunctionSafeName, JUNCTION_NAME_ERROR } from "@/lib/validate-junction-name";

// ─── Static data ──────────────────────────────────────────────────────────────

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
  "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
  "VT","VA","WA","WV","WI","WY",
];

const JOURNEY_OPTIONS = [
  "Just starting to plan",
  "Actively trying to conceive",
  "Trying again after a loss",
  "Working with a fertility clinic",
  "Taking a gentle pause",
];

const LOSS_OPTIONS = ["1", "2", "3", "4 or more", "Prefer not to say"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-charcoal mb-1.5">
      {children}
    </label>
  );
}

function TextInput({
  id, value, onChange, placeholder, type = "text", autoComplete, inputMode,
  error,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"];
  error?: string | null;
}) {
  return (
    <div>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className={`w-full rounded-2xl border px-4 py-3 text-sm text-charcoal bg-linen placeholder:text-muted focus:outline-none focus:border-charcoal transition-colors ${
          error ? "border-red-400" : "border-border"
        }`}
      />
      {error && <p className="mt-1.5 text-xs text-red-600 leading-snug">{error}</p>}
    </div>
  );
}

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-serif text-xl text-charcoal">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted leading-relaxed">{hint}</p>}
    </div>
  );
}

function PillButton({
  label, selected, onClick,
}: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
        selected
          ? "border-charcoal bg-champagne text-charcoal"
          : "border-border bg-white text-charcoal hover:border-charcoal/40"
      }`}
    >
      {label}
    </button>
  );
}

// ─── Main form component ──────────────────────────────────────────────────────

export function IntakeForm() {
  const router = useRouter();

  // ── Demographics
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState(""); // MM/DD/YYYY
  const [phone, setPhone] = useState("");
  const [biologicalSex, setBiologicalSex] = useState<"male" | "female" | "">("");

  // ── Address
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  // ── Health context (stored locally, not sent to Junction)
  const [journeyStage, setJourneyStage] = useState<string[]>([]);
  const [lossCount, setLossCount] = useState("");
  const [supplements, setSupplements] = useState("");

  // ── Consents
  const [consentHipaa, setConsentHipaa] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentTelehealth, setConsentTelehealth] = useState(false);

  // ── UI state
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // ── Validation
  const firstNameError =
    firstName && !isJunctionSafeName(firstName) ? JUNCTION_NAME_ERROR : null;
  const lastNameError =
    lastName && !isJunctionSafeName(lastName) ? JUNCTION_NAME_ERROR : null;

  const allConsents = consentHipaa && consentTerms && consentTelehealth;

  const canSubmit =
    isJunctionSafeName(firstName) &&
    isJunctionSafeName(lastName) &&
    dob.trim().length > 0 &&
    phone.replace(/\D/g, "").length >= 10 &&
    biologicalSex !== "" &&
    street.trim().length > 0 &&
    city.trim().length > 0 &&
    state !== "" &&
    zip.replace(/\D/g, "").length === 5 &&
    journeyStage.length > 0 &&
    lossCount !== "" &&
    allConsents &&
    !submitting;

  const toggleJourneyStage = (option: string) => {
    setJourneyStage((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]
    );
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setServerError(null);

    try {
      const res = await fetch("/api/intake/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dob: dob.trim(),
          phone: phone.trim(),
          biologicalSex,
          address: {
            street: street.trim(),
            city: city.trim(),
            state,
            zip: zip.trim(),
          },
          healthContext: {
            journeyStage,
            lossCount,
            supplements: supplements.trim(),
          },
          consents: {
            hipaaAuthorization: consentHipaa,
            termsOfUse: consentTerms,
            telehealthConsent: consentTelehealth,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setServerError(
          data.error ??
            "Something went wrong placing your order. Your information has been saved — please try again."
        );
        setSubmitting(false);
        return;
      }

      // Success — dashboard will show order_placed state
      router.replace("/dashboard");
    } catch {
      setServerError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      {/* ── Section 1: Your information ──────────────────────────────────── */}
      <section>
        <SectionHeading
          title="Your information"
          hint="Used for your lab order — must match the name on your government ID."
        />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel htmlFor="firstName">Legal first name</FieldLabel>
              <TextInput
                id="firstName"
                value={firstName}
                onChange={setFirstName}
                placeholder="First"
                autoComplete="given-name"
                error={firstNameError}
              />
            </div>
            <div>
              <FieldLabel htmlFor="lastName">Legal last name</FieldLabel>
              <TextInput
                id="lastName"
                value={lastName}
                onChange={setLastName}
                placeholder="Last"
                autoComplete="family-name"
                error={lastNameError}
              />
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="dob">Date of birth</FieldLabel>
            <TextInput
              id="dob"
              value={dob}
              onChange={setDob}
              placeholder="MM/DD/YYYY"
              autoComplete="bday"
              inputMode="numeric"
            />
          </div>

          <div>
            <FieldLabel htmlFor="phone">Phone number</FieldLabel>
            <TextInput
              id="phone"
              value={phone}
              onChange={setPhone}
              placeholder="(555) 555-5555"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
            />
          </div>

          <div>
            <FieldLabel>Biological sex</FieldLabel>
            <p className="text-xs text-muted mb-3 leading-relaxed">
              Required for the lab order. This refers to sex as documented on
              medical records, not gender identity.
            </p>
            <div className="flex gap-3">
              {(["female", "male"] as const).map((sex) => (
                <PillButton
                  key={sex}
                  label={sex.charAt(0).toUpperCase() + sex.slice(1)}
                  selected={biologicalSex === sex}
                  onClick={() => setBiologicalSex(sex)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: Your address ───────────────────────────────────────── */}
      <section>
        <SectionHeading
          title="Your address"
          hint="Used for your lab order and to find Quest locations near you."
        />
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="street">Street address</FieldLabel>
            <TextInput
              id="street"
              value={street}
              onChange={setStreet}
              placeholder="123 Main St"
              autoComplete="street-address"
            />
          </div>
          <div>
            <FieldLabel htmlFor="city">City</FieldLabel>
            <TextInput
              id="city"
              value={city}
              onChange={setCity}
              placeholder="City"
              autoComplete="address-level2"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel htmlFor="state">State</FieldLabel>
              <select
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full rounded-2xl border border-border px-4 py-3 text-sm text-charcoal bg-linen focus:outline-none focus:border-charcoal transition-colors"
              >
                <option value="">Select</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="zip">ZIP code</FieldLabel>
              <TextInput
                id="zip"
                value={zip}
                onChange={(v) => setZip(v.replace(/\D/g, "").slice(0, 5))}
                placeholder="10001"
                inputMode="numeric"
                autoComplete="postal-code"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 3: A little about you ────────────────────────────────── */}
      <section>
        <SectionHeading
          title="A little about you"
          hint="A few gentle questions about where you are right now. There are no wrong answers — this helps us read your results in context."
        />
        <div className="space-y-6">
          <div>
            <FieldLabel>Where are you in your fertility journey?</FieldLabel>
            <div className="flex flex-wrap gap-2 mt-2">
              {JOURNEY_OPTIONS.map((opt) => (
                <PillButton
                  key={opt}
                  label={opt}
                  selected={journeyStage.includes(opt)}
                  onClick={() => toggleJourneyStage(opt)}
                />
              ))}
            </div>
          </div>

          <div>
            <FieldLabel>How many pregnancy losses have you experienced?</FieldLabel>
            <p className="text-xs text-muted mb-2 leading-relaxed">
              Sharing this helps us understand your history. Answer only if you&apos;re comfortable.
            </p>
            <div className="flex flex-wrap gap-2">
              {LOSS_OPTIONS.map((opt) => (
                <PillButton
                  key={opt}
                  label={opt}
                  selected={lossCount === opt}
                  onClick={() => setLossCount(opt)}
                />
              ))}
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="supplements">
              Medications, vitamins, or supplements you currently take
              <span className="ml-1 font-normal text-muted">(optional)</span>
            </FieldLabel>
            <textarea
              id="supplements"
              value={supplements}
              onChange={(e) => setSupplements(e.target.value)}
              rows={3}
              placeholder="e.g. Prenatal multivitamin, Vitamin D, Folic acid — or &ldquo;none&rdquo;"
              className="w-full rounded-2xl border border-border px-4 py-3 text-sm text-charcoal bg-linen placeholder:text-muted focus:outline-none focus:border-charcoal transition-colors resize-none"
            />
          </div>
        </div>
      </section>

      {/* ── Section 4: Consents ───────────────────────────────────────────── */}
      <section>
        <SectionHeading
          title="Before we begin"
          hint="Please read and confirm each of the following."
        />
        <div className="space-y-4">
          {[
            {
              id: "consentHipaa",
              checked: consentHipaa,
              onChange: setConsentHipaa,
              label:
                "I authorize Carriage Health to use and disclose my protected health information as described in the HIPAA Authorization.",
            },
            {
              id: "consentTerms",
              checked: consentTerms,
              onChange: setConsentTerms,
              label:
                "I have read and agree to the Carriage Health Terms of Use.",
            },
            {
              id: "consentTelehealth",
              checked: consentTelehealth,
              onChange: setConsentTelehealth,
              label:
                "I understand that this service includes a telehealth component and consent to the Telehealth Informed Consent.",
            },
          ].map(({ id, checked, onChange, label }) => (
            <label
              key={id}
              htmlFor={id}
              className="flex items-start gap-3 cursor-pointer rounded-2xl border border-border bg-white p-4"
            >
              <input
                type="checkbox"
                id={id}
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="mt-0.5 shrink-0 accent-charcoal"
              />
              <span className="text-sm text-charcoal leading-relaxed">{label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* ── Errors + submit ───────────────────────────────────────────────── */}
      {serverError && (
        <p className="text-sm text-red-600 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 leading-relaxed">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-2xl bg-charcoal py-4 text-base font-medium text-white transition-colors hover:bg-charcoal/90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? "Placing your order…" : "Submit and place order"}
      </button>

      <p className="text-center text-xs text-muted">
        Your order is placed through Junction&apos;s physician network via Quest. Nothing ships to you — you visit a Quest location at your convenience.
      </p>
    </form>
  );
}
