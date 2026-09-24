import { NextResponse } from "next/server";

/**
 * Liveness probe for the platform. Intentionally has NO database dependency —
 * BharatTube's data lives in the external backend (NEXT_PUBLIC_API_URL), so
 * this must succeed even without DATABASE_URL / PostgreSQL.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "bharattube-frontend",
    backend: process.env.NEXT_PUBLIC_API_URL || null,
    time: new Date().toISOString(),
  });
}
