import { NextResponse } from "next/server";
import { junction } from "@/lib/junction";

// GET /api/junction/health-check
// Phase 1 connectivity probe: verifies the Junction API key works and the sandbox is reachable.
// Returns the number of available lab tests — no patient data involved.
// Remove or restrict this route before production.
export async function GET() {
  try {
    const labTests = await junction.getLabTests();
    return NextResponse.json({
      ok: true,
      environment: process.env.JUNCTION_BASE_URL ?? "not set",
      labTestCount: Array.isArray(labTests) ? labTests.length : null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
