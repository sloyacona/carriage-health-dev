// Core domain types — mirrors the Supabase schema (see supabase/migrations/001_initial_schema.sql)

export type Member = {
  id: string;
  auth_id: string;
  email: string;
  created_at: string;
};

export type JunctionUser = {
  id: string;
  member_id: string;
  junction_user_id: string;
  client_user_id: string; // opaque UUID — never contains PII (guardrail #6)
  created_at: string;
};

export type ConsentType =
  | "hipaa-authorization"
  | "terms-of-use"
  | "telehealth-informed-consent";

export type Consent = {
  id: string;
  member_id: string;
  consent_type: ConsentType;
  version: string;
  accepted_at: string;
  ip_address: string;
};

export type OrderStatus =
  | "payment_pending"
  | "intake_pending"
  | "order_placed"
  | "requisition_ready"
  | "appointment_scheduled"
  | "specimen_collected"
  | "results_pending"
  | "results_ready"
  | "results_concerning"
  | "cancelled";

export type Order = {
  id: string;
  member_id: string;
  junction_order_id: string | null;
  lab_test_id: string | null;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: string;
  member_id: string;
  order_id: string;
  stripe_payment_intent_id: string;
  amount: number; // cents
  status: string;
  created_at: string;
};

export type Appointment = {
  id: string;
  order_id: string;
  junction_appointment_id: string;
  psc_location: string;
  psc_address: string | null;
  psc_timezone: string | null;
  scheduled_for: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type SlotCard = {
  bookingKey: string;
  locationName: string;
  locationAddress: string;
  distanceMiles: number;
  startIso: string;
  timezone: string;
};

export type ResultStatus = "pending" | "ready" | "concerning";

export type Result = {
  id: string;
  order_id: string;
  status: ResultStatus;
  junction_result_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditAction =
  | "member.create"
  | "member.view"
  | "order.view"
  | "order.create"
  | "order.requisition_ready"
  | "payment.succeeded"
  | "result.view"
  | "result.pdf.view"
  | "consent.record"
  | "appointment.view"
  | "appointment.book"
  | "appointment.reschedule"
  | "appointment.cancel";

// Normalized shape returned by /api/results — insulates the client from Junction's field names.
export interface BiomarkerResult {
  name: string;
  value: number | null;
  unit: string | null;
  minRange: number | null;
  maxRange: number | null;
  isAboveMax: boolean;
  isBelowMin: boolean;
}

export interface ResultsData {
  interpretation: "normal" | "abnormal" | "critical";
  physicianNote: string | null;
  physicianName: string | null;
  reviewedAt: string | null;
  markers: BiomarkerResult[];
}

export type AuditLog = {
  id: string;
  actor: string; // member_id, 'system', or 'webhook'
  action: AuditAction;
  resource: string;
  member_id: string | null;
  ip_address: string | null;
  created_at: string;
};
