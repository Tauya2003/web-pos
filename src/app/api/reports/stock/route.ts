import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const products = await db.product.findMany({
    where: { organizationId: session.user.organizationId, active: true },
    include: { category: true },
    orderBy: { name: "asc" },
  });

  const report = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category?.name ?? "Uncategorized",
    priceUsd: p.priceUsd,
    stockQuantity: p.stockQuantity,
    lowStockThreshold: p.lowStockThreshold,
    isLowStock: p.stockQuantity <= p.lowStockThreshold,
    stockValue: p.stockQuantity * p.priceUsd,
  }));

  return NextResponse.json(report);
}
