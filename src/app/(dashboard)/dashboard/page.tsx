import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatUSD, formatZIG } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Package, AlertTriangle, TrendingUp, DollarSign } from "lucide-react";
import { startOfDay, startOfMonth, startOfWeek } from "date-fns";

export default async function DashboardPage() {
  const session = await auth();
  const orgId = session!.user.organizationId;

  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);

  const [org, todaySales, weekSales, monthSales, lowStockCount, totalProducts] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId } }),
    db.sale.aggregate({
      where: { organizationId: orgId, voided: false, createdAt: { gte: todayStart } },
      _sum: { totalUsd: true },
      _count: true,
    }),
    db.sale.aggregate({
      where: { organizationId: orgId, voided: false, createdAt: { gte: weekStart } },
      _sum: { totalUsd: true },
    }),
    db.sale.aggregate({
      where: { organizationId: orgId, voided: false, createdAt: { gte: monthStart } },
      _sum: { totalUsd: true },
    }),
    db.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Product"
      WHERE "organizationId" = ${orgId}
      AND active = true
      AND "stockQuantity" <= "lowStockThreshold"
    `.then((r) => Number(r[0].count)),
    db.product.count({ where: { organizationId: orgId, active: true } }),
  ]);

  const zigRate = org?.zigRate ?? 36;

  const stats = [
    {
      label: "Today's Sales",
      value: formatUSD(todaySales._sum.totalUsd ?? 0),
      sub: formatZIG((todaySales._sum.totalUsd ?? 0) * zigRate),
      icon: ShoppingCart,
      detail: `${todaySales._count} transactions`,
      color: "blue",
    },
    {
      label: "This Week",
      value: formatUSD(weekSales._sum.totalUsd ?? 0),
      sub: formatZIG((weekSales._sum.totalUsd ?? 0) * zigRate),
      icon: TrendingUp,
      color: "green",
    },
    {
      label: "This Month",
      value: formatUSD(monthSales._sum.totalUsd ?? 0),
      sub: formatZIG((monthSales._sum.totalUsd ?? 0) * zigRate),
      icon: DollarSign,
      color: "purple",
    },
    {
      label: "Products",
      value: totalProducts.toString(),
      icon: Package,
      color: "orange",
    },
  ];

  const colorMap: Record<string, string> = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    purple: "bg-purple-100 text-purple-600",
    orange: "bg-orange-100 text-orange-600",
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">{org?.name} · Exchange rate: 1 USD = {zigRate} ZiG</p>
        </div>
        {typeof lowStockCount === "number" && lowStockCount > 0 && (
          <Badge variant="warning" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {lowStockCount} low stock item{lowStockCount > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-600">{stat.label}</CardTitle>
                  <div className={`p-2 rounded-lg ${colorMap[stat.color]}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                {stat.sub && <p className="text-xs text-gray-500 mt-1">{stat.sub}</p>}
                {stat.detail && <p className="text-xs text-gray-400 mt-1">{stat.detail}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <RecentSales orgId={orgId} zigRate={zigRate} />
    </div>
  );
}

async function RecentSales({ orgId, zigRate }: { orgId: string; zigRate: number }) {
  const sales = await db.sale.findMany({
    where: { organizationId: orgId, voided: false },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { user: true, customer: true },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Sales</CardTitle>
      </CardHeader>
      <CardContent>
        {sales.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No sales yet. Start by going to POS / Sales.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 font-medium text-gray-500">Receipt</th>
                  <th className="text-left py-2 font-medium text-gray-500">Cashier</th>
                  <th className="text-left py-2 font-medium text-gray-500">Currency</th>
                  <th className="text-right py-2 font-medium text-gray-500">Total (USD)</th>
                  <th className="text-right py-2 font-medium text-gray-500">Date</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 font-mono text-xs text-blue-600">{sale.receiptNumber}</td>
                    <td className="py-2 text-gray-700">{sale.user.name}</td>
                    <td className="py-2">
                      <Badge variant={sale.currency === "USD" ? "default" : "warning"} className="text-xs">
                        {sale.currency}
                      </Badge>
                    </td>
                    <td className="py-2 text-right font-semibold">{formatUSD(sale.totalUsd)}</td>
                    <td className="py-2 text-right text-gray-500">
                      {new Date(sale.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
