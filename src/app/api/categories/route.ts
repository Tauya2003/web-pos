import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const categories = await db.category.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name } = z.object({ name: z.string().min(1) }).parse(await req.json());
  const category = await db.category.create({
    data: { name, organizationId: session.user.organizationId },
  });
  return NextResponse.json(category, { status: 201 });
}
