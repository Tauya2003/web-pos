import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  businessName: z.string().min(2),
  adminName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { businessName, adminName, email, password } = schema.parse(body);

    const org = await db.organization.create({
      data: {
        name: businessName,
        email,
        users: {
          create: {
            name: adminName,
            email,
            passwordHash: await bcrypt.hash(password, 12),
            role: "ADMIN",
          },
        },
      },
    });

    return NextResponse.json({ organizationId: org.id }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    }
    console.error("[register]", err);
    const msg = err instanceof Error ? err.message : "Registration failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
