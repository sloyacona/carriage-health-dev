import "server-only";

// This module may only be imported by server-side code (API routes, Server Actions).
// The "server-only" import above causes a build error if accidentally used in a client component.

const BASE_URL = process.env.JUNCTION_BASE_URL;
const API_KEY = process.env.JUNCTION_API_KEY;

async function junctionFetch(path: string, options: RequestInit = {}) {
  if (!BASE_URL || !API_KEY) {
    throw new Error(
      "Junction environment variables are not configured. Set JUNCTION_BASE_URL and JUNCTION_API_KEY."
    );
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "x-vital-api-key": API_KEY,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(`Junction ${res.status} on ${path}: ${body}`);
  }

  return res.json();
}

export const junction = {
  // Phase 1: connectivity probe
  getLabTests: () => junctionFetch("/v3/lab_tests/"),

  // Phase 2: create a Junction user; client_user_id must be an opaque UUID (guardrail #6)
  createUser: (clientUserId: string) =>
    junctionFetch("/v2/user/", {
      method: "POST",
      body: JSON.stringify({ client_user_id: clientUserId }),
    }),

  // Phase 4: place an order; omit physician block to route through Junction's network
  createOrder: (payload: {
    user_id: string;
    patient_details: unknown;
    patient_address: unknown;
    lab_test_id: string;
    consents?: unknown;
  }) =>
    junctionFetch("/v3/order/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Phase 5: PSC scheduling
  // zip_code and radius must be query params (not body) — confirmed against sandbox.
  getPscAvailability: (zipCode: string, radius: number) =>
    junctionFetch(
      `/v3/order/psc/appointment/availability?lab=quest&zip_code=${encodeURIComponent(zipCode)}&radius=${radius}`,
      { method: "POST", body: JSON.stringify({}) }
    ),

  bookAppointment: (orderId: string, payload: unknown) =>
    junctionFetch(`/v3/order/${orderId}/psc/appointment/book`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  rescheduleAppointment: (orderId: string, payload: unknown) =>
    junctionFetch(`/v3/order/${orderId}/psc/appointment/reschedule`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  cancelAppointment: (orderId: string) =>
    junctionFetch(`/v3/order/${orderId}/psc/appointment/cancel`, {
      method: "PATCH",
    }),

  getAppointment: (orderId: string) =>
    junctionFetch(`/v3/order/${orderId}/psc/appointment`),

  // Phase 6: results
  getResult: (orderId: string) =>
    junctionFetch(`/v3/order/${orderId}/result`),

  // Returns { url: string } — a signed URL for the lab report PDF.
  getResultPdfUrl: (orderId: string) =>
    junctionFetch(`/v3/order/${orderId}/result/pdf`),
};
