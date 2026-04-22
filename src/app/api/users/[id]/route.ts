import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import bcrypt from "bcryptjs";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
  pin: z.string().length(4).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await db.user.findFirst({
    where: { id, organizationId: session.user.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const body = await req.json();
    const { name, active, password, pin } = updateSchema.parse(body);

    const updated = await db.user.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(active !== undefined && { active }),
        ...(password && { passwordHash: await bcrypt.hash(password, 12) }),
        ...(pin && { pin: await bcrypt.hash(pin, 10) }),
      },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (id === session.user.id)
    return NextResponse.json({ error: "Cannot deactivate yourself" }, { status: 400 });

  await db.user.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ success: true });
}
