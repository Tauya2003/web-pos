import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { RefundMethod, Currency } from "@prisma/client";

const returnSchema = z.object({
  saleId: z.string(),
  reason: z.string().min(1),
  refundMethod: z.nativeEnum(RefundMethod),
  currency: z.nativeEnum(Currency).default("USD"),
  items: z.array(
    z.object({
      saleItemId: z.string(),
      productId: z.string(),
      quantity: z.number().int().min(1),
      refundUsd: z.number().min(0),
    })
  ).min(1),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const returns = await db.return.findMany({
    where: { organizationId: session.user.organizationId },
    include: { sale: true, user: true, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(returns);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { saleId, reason, refundMethod, currency, items } = returnSchema.parse(body);

    const org = await db.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { zigRate: true },
    });

    const sale = await db.sale.findFirst({
      where: { id: saleId, organizationId: session.user.organizationId },
      include: { items: true },
    });
    if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

    for (const ri of items) {
      const saleItem = sale.items.find((si) => si.id === ri.saleItemId);
      if (!saleItem) return NextResponse.json({ error: `Sale item not found: ${ri.saleItemId}` }, { status: 400 });

      const alreadyReturned = await db.returnItem.aggregate({
        where: { saleItemId: ri.saleItemId },
        _sum: { quantity: true },
      });
      const alreadyQty = alreadyReturned._sum.quantity ?? 0;
      if (alreadyQty + ri.quantity > saleItem.quantity) {
        return NextResponse.json({ error: `Cannot return more than purchased for item ${saleItem.productName}` }, { status: 400 });
      }
    }

    const totalRefund = items.reduce((s, i) => s + i.refundUsd, 0);

    const ret = await db.$transaction(async (tx) => {
      const newReturn = await tx.return.create({
        data: {
          organizationId: session.user.organizationId,
          saleId,
          userId: session.user.id,
          reason,
          refundMethod,
          refundUsd: totalRefund,
          currency,
          exchangeRate: org?.zigRate ?? 36,
          items: { create: items },
        },
        include: { sale: true, items: { include: { product: true } }, user: true },
      });

      for (const ri of items) {
        await tx.product.update({
          where: { id: ri.productId },
          data: { stockQuantity: { increment: ri.quantity } },
        });
      }

      return newReturn;
    });

    return NextResponse.json(ret, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    if (err instanceof Error)
      return NextResponse.json({ error: err.message }, { status: 422 });
    return NextResponse.json({ error: "Return failed" }, { status: 500 });
  }
}
