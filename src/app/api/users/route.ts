import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.nativeEnum(Role),
  password: z.string().min(6).optional(),
  pin: z.string().length(4).optional(),
}).refine((d) => d.role === "CASHIER" ? !!d.pin : !!d.password, {
  message: "Admins need a password; Cashiers need a 4-digit PIN",
});

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await db.user.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { name, email, role, password, pin } = createSchema.parse(body);

    const user = await db.user.create({
      data: {
        organizationId: session.user.organizationId,
        name,
        email,
        role,
        passwordHash: password ? await bcrypt.hash(password, 12) : undefined,
        pin: pin ? await bcrypt.hash(pin, 10) : undefined,
      },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
