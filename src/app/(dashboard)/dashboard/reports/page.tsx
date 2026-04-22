"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUSD } from "@/lib/utils";
import { Download, BarChart3, Package, AlertTriangle } from "lucide-react";

interface SalesReport {
  totalSales: number; totalTax: number; totalDiscount: number;
  count: number; byCurrency: Record<string, number>;
  byDay: Record<string, { count: number; totalUsd: number }>;
  returnsCount: number; returnsTotal: number;
}

interface StockItem {
  id: string; name: string; sku: string | null; category: string;
  priceUsd: number; stockQuantity: number; lowStockThreshold: number;
  isLowStock: boolean; stockValue: number;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [from, setFrom] = useState(toISODate(thirtyDaysAgo));
  const [to, setTo] = useState(toISODate(today));
  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  const [stockReport, setStockReport] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"sales" | "stock" | "tax">("sales");

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const [salesRes, stockRes] = await Promise.all([
      fetch(`/api/reports/sales?from=${from}&to=${to}`),
      fetch("/api/reports/stock"),
    ]);
    setSalesReport(await salesRes.json());
    setStockReport(await stockRes.json());
    setLoading(false);
  }, [from, to]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  function exportCSV(data: object[], filename: string) {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const rows = data.map((row) =>
      headers.map((h) => JSON.stringify((row as Record<string, unknown>)[h] ?? "")).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function exportSalesByDay() {
    if (!salesReport) return;
    const data = Object.entries(salesReport.byDay).map(([date, stats]) => ({
      Date: date, Transactions: stats.count, "Total (USD)": stats.totalUsd.toFixed(2),
    }));
    exportCSV(data, `sales-report-${from}-to-${to}.csv`);
  }

  function exportStock() {
    exportCSV(stockReport.map((p) => ({
      Name: p.name, SKU: p.sku ?? "", Category: p.category,
      "Price (USD)": p.priceUsd, Stock: p.stockQuantity,
      "Low Stock Threshold": p.lowStockThreshold,
      "Low Stock?": p.isLowStock ? "YES" : "NO",
      "Stock Value (USD)": p.stockValue.toFixed(2),
    })), "stock-report.csv");
  }

  function exportTax() {
    if (!salesReport) return;
    const data = Object.entries(salesReport.byDay).map(([date, stats]) => ({
      Date: date,
      "Sales (USD)": stats.totalUsd.toFixed(2),
      "Tax Collected (USD)": (salesReport.totalTax / salesReport.count * stats.count).toFixed(2),
    }));
    exportCSV(data, `tax-report-${from}-to-${to}.csv`);
  }

  const tabs = [
    { key: "sales", label: "Sales Report", icon: BarChart3 },
    { key: "stock", label: "Stock Report", icon: Package },
    { key: "tax", label: "Tax Report", icon: BarChart3 },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 text-sm mt-1">Analyse sales, stock, and tax data</p>
        </div>
      </div>

      {/* Date range */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
            </div>
            <div>
              <Label>To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
            </div>
            <Button onClick={fetchReports} disabled={loading}>{loading ? "Loading..." : "Apply"}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      {salesReport && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Sales", value: formatUSD(salesReport.totalSales) },
            { label: "Transactions", value: salesReport.count.toString() },
            { label: "Tax Collected", value: formatUSD(salesReport.totalTax) },
            { label: "Total Discounts", value: formatUSD(salesReport.totalDiscount) },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "sales" && salesReport && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Sales by Day</CardTitle>
            <Button variant="outline" size="sm" onClick={exportSalesByDay}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 mb-4">
              {Object.entries(salesReport.byCurrency).map(([cur, total]) => (
                <div key={cur} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <Badge variant={cur === "USD" ? "default" : "warning"}>{cur}</Badge>
                  <span className="font-semibold">{formatUSD(total)}</span>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr>
                    <th className="text-left py-2 font-medium text-gray-500">Date</th>
                    <th className="text-right py-2 font-medium text-gray-500">Transactions</th>
                    <th className="text-right py-2 font-medium text-gray-500">Total (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(salesReport.byDay)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .map(([date, stats]) => (
                    <tr key={date} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2">{date}</td>
                      <td className="py-2 text-right">{stats.count}</td>
                      <td className="py-2 text-right font-semibold">{formatUSD(stats.totalUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "stock" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Stock Levels</CardTitle>
            <Button variant="outline" size="sm" onClick={exportStock}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr>
                    <th className="text-left py-2 font-medium text-gray-500">Product</th>
                    <th className="text-left py-2 font-medium text-gray-500">Category</th>
                    <th className="text-right py-2 font-medium text-gray-500">Price</th>
                    <th className="text-right py-2 font-medium text-gray-500">Stock</th>
                    <th className="text-right py-2 font-medium text-gray-500">Value</th>
                    <th className="text-center py-2 font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stockReport.map((p) => (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 font-medium">{p.name}</td>
                      <td className="py-2 text-gray-500">{p.category}</td>
                      <td className="py-2 text-right">{formatUSD(p.priceUsd)}</td>
                      <td className={`py-2 text-right font-bold ${p.isLowStock ? "text-red-600" : "text-gray-900"}`}>
                        {p.stockQuantity}
                        {p.isLowStock && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                      </td>
                      <td className="py-2 text-right">{formatUSD(p.stockValue)}</td>
                      <td className="py-2 text-center">
                        {p.isLowStock ? (
                          <Badge variant="destructive">Low Stock</Badge>
                        ) : (
                          <Badge variant="success">OK</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "tax" && salesReport && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Tax Summary (VAT)</CardTitle>
            <Button variant="outline" size="sm" onClick={exportTax}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-600">Total Tax Collected</p>
                <p className="text-2xl font-bold text-blue-700">{formatUSD(salesReport.totalTax)}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-xs text-green-600">Net Sales (ex-tax)</p>
                <p className="text-2xl font-bold text-green-700">{formatUSD(salesReport.totalSales - salesReport.totalTax)}</p>
              </div>
            </div>
            <div className="p-3 bg-red-50 rounded-lg mb-4">
              <p className="text-xs text-red-600">Returns (refunded)</p>
              <p className="text-xl font-bold text-red-700">
                {salesReport.returnsCount} returns · {formatUSD(salesReport.returnsTotal)} refunded
              </p>
            </div>
            <p className="text-xs text-gray-400">
              This summary is for reference. Consult your accountant for official ZIMRA VAT submissions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
