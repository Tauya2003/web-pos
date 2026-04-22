import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateReceiptNumber } from "@/lib/utils";
import { z } from "zod";
import { Currency, DiscountType } from "@prisma/client";

const saleItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1),
  unitPriceUsd: z.number().min(0),
  discountType: z.nativeEnum(DiscountType).nullable().optional(),
  discountVal: z.number().min(0).default(0),
});

const saleSchema = z.object({
  currency: z.nativeEnum(Currency).default("USD"),
  exchangeRate: z.number().min(0),
  items: z.array(saleItemSchema).min(1),
  customerId: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const receipt = searchParams.get("receipt") ?? "";
  const take = parseInt(searchParams.get("take") ?? "50");
  const skip = parseInt(searchParams.get("skip") ?? "0");

  const sales = await db.sale.findMany({
    where: {
      organizationId: session.user.organizationId,
      voided: false,
      ...(receipt && { receiptNumber: { contains: receipt, mode: "insensitive" } }),
    },
    include: { user: true, customer: true, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take,
    skip,
  });

  return NextResponse.json(sales);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { currency, exchangeRate, items, customerId, notes } = saleSchema.parse(body);

    const org = await db.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { taxRate: true, zigRate: true },
    });
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    const productIds = items.map((i) => i.productId);
    const products = await db.product.findMany({
      where: { id: { in: productIds }, organizationId: session.user.organizationId, active: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotalUsd = 0;
    let totalDiscountUsd = 0;
    let totalTaxUsd = 0;

    const computedItems = items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Product ${item.productId} not found`);
      if (product.stockQuantity < item.quantity)
        throw new Error(`Insufficient stock for ${product.name}`);

      const lineGross = item.unitPriceUsd * item.quantity;
      let discountUsd = 0;
      if (item.discountType === "PERCENTAGE") {
        discountUsd = lineGross * (item.discountVal / 100);
      } else if (item.discountType === "FIXED") {
        discountUsd = Math.min(item.discountVal, lineGross);
      }
      const afterDiscount = lineGross - discountUsd;
      const taxRate = product.taxExempt ? 0 : org.taxRate / 100;
      const taxUsd = afterDiscount * taxRate;
      const lineTotal = afterDiscount + taxUsd;

      subtotalUsd += lineGross;
      totalDiscountUsd += discountUsd;
      totalTaxUsd += taxUsd;

      return {
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPriceUsd: item.unitPriceUsd,
        discountType: item.discountType ?? undefined,
        discountVal: item.discountVal,
        discountUsd,
        taxUsd,
        lineTotalUsd: lineTotal,
      };
    });

    const totalUsd = subtotalUsd - totalDiscountUsd + totalTaxUsd;

    const sale = await db.$transaction(async (tx) => {
      const newSale = await tx.sale.create({
        data: {
          organizationId: session.user.organizationId,
          receiptNumber: generateReceiptNumber(),
          userId: session.user.id,
          customerId: customerId || undefined,
          currency,
          exchangeRate,
          subtotalUsd,
          discountUsd: totalDiscountUsd,
          taxUsd: totalTaxUsd,
          totalUsd,
          notes,
          items: { create: computedItems },
        },
        include: { items: { include: { product: true } }, user: true, customer: true },
      });

      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { decrement: item.quantity } },
        });
      }

      return newSale;
    });

    return NextResponse.json(sale, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    if (err instanceof Error)
      return NextResponse.json({ error: err.message }, { status: 422 });
    return NextResponse.json({ error: "Sale failed" }, { status: 500 });
  }
}
