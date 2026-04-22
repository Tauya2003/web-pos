"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { formatUSD } from "@/lib/utils";
import { Search, RotateCcw, AlertCircle } from "lucide-react";

interface SaleItem {
  id: string; productId: string; productName: string;
  quantity: number; unitPriceUsd: number; lineTotalUsd: number;
}
interface Sale {
  id: string; receiptNumber: string; totalUsd: number; createdAt: string;
  currency: string; customer: { name: string } | null;
  items: SaleItem[];
}
interface ReturnItem { saleItemId: string; productId: string; quantity: number; refundUsd: number }
interface ReturnRecord {
  id: string; createdAt: string; reason: string; refundUsd: number;
  refundMethod: string; currency: string;
  sale: { receiptNumber: string };
  user: { name: string };
}

export default function ReturnsPage() {
  const [searchReceipt, setSearchReceipt] = useState("");
  const [foundSale, setFoundSale] = useState<Sale | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [currency, setCurrency] = useState("USD");
  const [submitting, setSubmitting] = useState(false);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);

  useEffect(() => {
    fetch("/api/returns").then((r) => r.json()).then(setReturns);
  }, []);

  async function searchSale() {
    if (!searchReceipt.trim()) return;
    setSearching(true);
    setNotFound(false);
    setFoundSale(null);
    const res = await fetch(`/api/sales?receipt=${encodeURIComponent(searchReceipt)}&take=1`);
    const data = await res.json();
    setSearching(false);
    if (!Array.isArray(data) || data.length === 0) {
      setNotFound(true);
      return;
    }
    setFoundSale(data[0]);
    setReturnItems(data[0].items.map((i: SaleItem) => ({
      saleItemId: i.id,
      productId: i.productId,
      quantity: 0,
      refundUsd: 0,
    })));
  }

  function updateReturnItem(saleItemId: string, field: "quantity" | "refundUsd", val: number) {
    setReturnItems((prev) => prev.map((ri) =>
      ri.saleItemId === saleItemId ? { ...ri, [field]: val } : ri
    ));
  }

  async function submitReturn() {
    if (!foundSale) return;
    const activeItems = returnItems.filter((ri) => ri.quantity > 0);
    if (activeItems.length === 0) {
      toast({ title: "Select items to return", variant: "destructive" });
      return;
    }
    if (!reason.trim()) {
      toast({ title: "Enter a return reason", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saleId: foundSale.id,
        reason,
        refundMethod,
        currency,
        items: activeItems,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const e = await res.json();
      toast({ title: "Return failed", description: e.error, variant: "destructive" });
      return;
    }
    toast({ title: "Return processed", variant: "success" });
    setDialogOpen(false);
    setFoundSale(null);
    setSearchReceipt("");
    setReason("");
    const updatedReturns = await fetch("/api/returns").then((r) => r.json());
    setReturns(updatedReturns);
  }

  const refundTotal = returnItems.reduce((s, ri) => s + (ri.refundUsd || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Returns</h1>
        <p className="text-gray-500 text-sm mt-1">Look up a receipt to process a return</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Find Transaction</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Enter receipt number..."
                value={searchReceipt}
                onChange={(e) => setSearchReceipt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchSale()}
                className="pl-9"
              />
            </div>
            <Button onClick={searchSale} disabled={searching}>
              {searching ? "Searching..." : "Search"}
            </Button>
          </div>

          {notFound && (
            <div className="mt-4 flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="h-4 w-4" />
              No transaction found for receipt: {searchReceipt}
            </div>
          )}

          {foundSale && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-blue-900">{foundSale.receiptNumber}</p>
                  <p className="text-sm text-blue-700">
                    {new Date(foundSale.createdAt).toLocaleString()} ·
                    {foundSale.currency} · Total: {formatUSD(foundSale.totalUsd)}
                  </p>
                  {foundSale.customer && (
                    <p className="text-sm text-blue-600">Customer: {foundSale.customer.name}</p>
                  )}
                </div>
                <Button onClick={() => setDialogOpen(true)}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Process Return
                </Button>
              </div>
              <div className="mt-3 space-y-1">
                {foundSale.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm text-blue-800">
                    <span>{item.productName} × {item.quantity}</span>
                    <span>{formatUSD(item.lineTotalUsd)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Return history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Return History</CardTitle>
        </CardHeader>
        <CardContent>
          {returns.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No returns yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr>
                    <th className="text-left py-2 font-medium text-gray-500">Receipt</th>
                    <th className="text-left py-2 font-medium text-gray-500">Reason</th>
                    <th className="text-left py-2 font-medium text-gray-500">Refund Method</th>
                    <th className="text-right py-2 font-medium text-gray-500">Refund</th>
                    <th className="text-right py-2 font-medium text-gray-500">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((ret) => (
                    <tr key={ret.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 font-mono text-xs text-blue-600">{ret.sale.receiptNumber}</td>
                      <td className="py-2 text-gray-700 max-w-48 truncate">{ret.reason}</td>
                      <td className="py-2">
                        <Badge variant="secondary">{ret.refundMethod.replace("_", " ")}</Badge>
                      </td>
                      <td className="py-2 text-right font-semibold text-red-600">
                        {formatUSD(ret.refundUsd)}
                      </td>
                      <td className="py-2 text-right text-gray-500">
                        {new Date(ret.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Return dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Process Return — {foundSale?.receiptNumber}</DialogTitle>
          </DialogHeader>
          {foundSale && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-gray-600">Select quantities to return and enter refund amounts:</p>
              <div className="space-y-3">
                {foundSale.items.map((item) => {
                  const ri = returnItems.find((r) => r.saleItemId === item.id)!;
                  return (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex justify-between items-start mb-2">
                        <p className="font-medium text-sm">{item.productName}</p>
                        <p className="text-xs text-gray-500">Max: {item.quantity} × {formatUSD(item.unitPriceUsd)}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Return Qty</Label>
                          <Input
                            type="number"
                            min="0"
                            max={item.quantity}
                            value={ri?.quantity || ""}
                            onChange={(e) => updateReturnItem(item.id, "quantity", parseInt(e.target.value) || 0)}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Refund (USD)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max={item.lineTotalUsd}
                            value={ri?.refundUsd || ""}
                            onChange={(e) => updateReturnItem(item.id, "refundUsd", parseFloat(e.target.value) || 0)}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div>
                <Label>Return Reason *</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Damaged, wrong item, customer changed mind..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Refund Method</Label>
                  <Select value={refundMethod} onValueChange={setRefundMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="STORE_CREDIT">Store Credit</SelectItem>
                      <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Refund Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="ZIG">ZiG</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
                <span className="text-sm font-medium">Total Refund</span>
                <span className="text-lg font-bold text-red-600">{formatUSD(refundTotal)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={submitReturn} disabled={submitting}>
              {submitting ? "Processing..." : "Confirm Return"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
