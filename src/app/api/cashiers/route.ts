import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Public endpoint — only returns name + id, no sensitive data
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const cashiers = await db.user.findMany({
    where: { organizationId: orgId, role: "CASHIER", active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(cashiers);
}
