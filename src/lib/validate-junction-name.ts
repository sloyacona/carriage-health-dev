// Junction's ordering system rejects accented characters (é, ñ, ü, etc.) and most
// punctuation. This function enforces the safe subset on both client and server —
// never import "server-only" here so it can be used in client components.

const JUNCTION_SAFE = /^[A-Za-z\s\-'.]+$/;

export function isJunctionSafeName(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && JUNCTION_SAFE.test(trimmed);
}

export const JUNCTION_NAME_ERROR =
  "The lab system only supports letters, hyphens (‑), apostrophes ('), and periods. " +
  "For names with accents — like José or María — please use the unaccented spelling " +
  "(Jose, Maria). We know that's not ideal and are working to improve this.";

// Strips all non-digit characters and converts to E.164 format (+1XXXXXXXXXX).
// Returns null if the result isn't a valid US phone number.
export function normalizeUsPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
