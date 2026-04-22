import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const settingsSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  vatNumber: z.string().optional(),
  returnPolicy: z.string().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  zigRate: z.number().min(0).optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  smtpFrom: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await db.organization.findUnique({
    where: { id: session.user.organizationId },
    select: {
      id: true, name: true, address: true, phone: true, email: true,
      vatNumber: true, returnPolicy: true, taxRate: true, zigRate: true,
      smtpHost: true, smtpPort: true, smtpUser: true, smtpFrom: true,
    },
  });
  return NextResponse.json(org);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const data = settingsSchema.parse(body);
    const org = await db.organization.update({
      where: { id: session.user.organizationId },
      data,
    });
    return NextResponse.json(org);
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
