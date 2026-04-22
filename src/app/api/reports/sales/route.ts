import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : new Date();
  to.setHours(23, 59, 59, 999);

  const orgId = session.user.organizationId;

  const [sales, returnsSummary] = await Promise.all([
    db.sale.findMany({
      where: { organizationId: orgId, voided: false, createdAt: { gte: from, lte: to } },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    }),
    db.return.aggregate({
      where: { organizationId: orgId, createdAt: { gte: from, lte: to } },
      _sum: { refundUsd: true },
      _count: true,
    }),
  ]);

  const totalSales = sales.reduce((s, sale) => s + sale.totalUsd, 0);
  const totalTax = sales.reduce((s, sale) => s + sale.taxUsd, 0);
  const totalDiscount = sales.reduce((s, sale) => s + sale.discountUsd, 0);

  const byCurrency = sales.reduce(
    (acc, sale) => {
      acc[sale.currency] = (acc[sale.currency] ?? 0) + sale.totalUsd;
      return acc;
    },
    {} as Record<string, number>
  );

  const byDay = sales.reduce(
    (acc, sale) => {
      const day = sale.createdAt.toISOString().slice(0, 10);
      if (!acc[day]) acc[day] = { count: 0, totalUsd: 0 };
      acc[day].count++;
      acc[day].totalUsd += sale.totalUsd;
      return acc;
    },
    {} as Record<string, { count: number; totalUsd: number }>
  );

  return NextResponse.json({
    totalSales,
    totalTax,
    totalDiscount,
    count: sales.length,
    byCurrency,
    byDay,
    returnsCount: returnsSummary._count,
    returnsTotal: returnsSummary._sum.refundUsd ?? 0,
  });
}
