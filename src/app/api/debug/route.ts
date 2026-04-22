import { NextResponse } from "next/server";

export async function GET() {
  const checks: Record<string, string> = {};

  checks.DATABASE_URL = process.env.DATABASE_URL ? "set" : "MISSING";
  checks.AUTH_SECRET = process.env.AUTH_SECRET ? "set" : "MISSING";

  try {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    await db.$queryRaw`SELECT 1`;
    checks.db = "connected";
  } catch (err) {
    checks.db = err instanceof Error ? err.message : String(err);
  }

  try {
    await import("bcryptjs");
    checks.bcryptjs = "ok";
  } catch (err) {
    checks.bcryptjs = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(checks);
}
