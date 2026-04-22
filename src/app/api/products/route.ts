import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  priceUsd: z.number().min(0),
  categoryId: z.string().optional(),
  taxExempt: z.boolean().default(false),
  stockQuantity: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = session.user.organizationId;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? "";
  const lowStock = searchParams.get("lowStock") === "1";

  let products = await db.product.findMany({
    where: {
      organizationId: orgId,
      active: true,
      ...(q && {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
          { barcode: { contains: q, mode: "insensitive" } },
        ],
      }),
      ...(category && { categoryId: category }),
    },
    include: { category: true },
    orderBy: { name: "asc" },
  });

  if (lowStock) {
    products = products.filter((p) => p.stockQuantity <= p.lowStockThreshold);
  }

  return NextResponse.json(products);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const data = productSchema.parse(body);
    const product = await db.product.create({
      data: { ...data, organizationId: session.user.organizationId },
      include: { category: true },
    });
    return NextResponse.json(product, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
