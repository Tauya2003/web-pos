"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatUSD, formatZIG, usdToZig } from "@/lib/utils";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, CheckCircle,
  Printer, Mail, X, Tag, Percent, DollarSign, Banknote, CreditCard, Smartphone,
} from "lucide-react";
import { ReceiptView } from "@/components/receipt/receipt-view";

interface Product {
  id: string; name: string; sku: string | null; barcode: string | null;
  priceUsd: number; taxExempt: boolean; stockQuantity: number;
  lowStockThreshold: number; category: { name: string } | null;
}

interface CartItem {
  product: Product;
  quantity: number;
  discountType: "PERCENTAGE" | "FIXED" | null;
  discountVal: number;
}

type Currency = "USD" | "ZIG";

interface SaleResult {
  id: string; receiptNumber: string; totalUsd: number; taxUsd: number;
  subtotalUsd: number; discountUsd: number; currency: Currency;
  exchangeRate: number; createdAt: string;
  items: Array<{ productName: string; quantity: number; unitPriceUsd: number; lineTotalUsd: number; taxUsd: number }>;
  user: { name: string };
  customer: { name: string; email: string | null } | null;
}

function computeItem(item: CartItem, taxRate: number) {
  const gross = item.product.priceUsd * item.quantity;
  let discountUsd = 0;
  if (item.discountType === "PERCENTAGE") discountUsd = gross * (item.discountVal / 100);
  else if (item.discountType === "FIXED") discountUsd = Math.min(item.discountVal, gross);
  const afterDiscount = gross - discountUsd;
  const taxUsd = item.product.taxExempt ? 0 : afterDiscount * (taxRate / 100);
  return { gross, discountUsd, taxUsd, lineTotal: afterDiscount + taxUsd };
}

export function POSScreen({ taxRate, zigRate, orgName }: { taxRate: number; zigRate: number; orgName: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [completing, setCompleting] = useState(false);
  const [completedSale, setCompletedSale] = useState<SaleResult | null>(null);
  const [discountDialog, setDiscountDialog] = useState<string | null>(null);
  const [discountForm, setDiscountForm] = useState({ type: "PERCENTAGE" as "PERCENTAGE" | "FIXED", val: "" });
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "MOBILE_MONEY">("CASH");
  const [cashReceived, setCashReceived] = useState("");
  const [paymentInfo, setPaymentInfo] = useState<{ method: "CASH" | "CARD" | "MOBILE_MONEY"; cashReceivedUsd?: number; changeUsd?: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchProducts = useCallback(async () => {
    const params = search ? `?q=${encodeURIComponent(search)}` : "";
    const res = await fetch(`/api/products${params}`);
    const data = await res.json();
    setProducts(data);
  }, [search]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  function addToCart(product: Product) {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.product.id === product.id);
      if (idx >= 0) {
        const updated = [...prev];
        if (updated[idx].quantity < product.stockQuantity) {
          updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1 };
        }
        return updated;
      }
      if (product.stockQuantity === 0) {
        toast({ title: "Out of stock", variant: "destructive" });
        return prev;
      }
      return [...prev, { product, quantity: 1, discountType: null, discountVal: 0 }];
    });
    searchRef.current?.focus();
  }

  function updateQty(productId: string, qty: number) {
    setCart((prev) => prev.map((i) =>
      i.product.id === productId
        ? { ...i, quantity: Math.max(1, Math.min(qty, i.product.stockQuantity)) }
        : i
    ));
  }

  function removeItem(productId: string) {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }

  function applyDiscount(productId: string) {
    setCart((prev) => prev.map((i) =>
      i.product.id === productId
        ? { ...i, discountType: discountForm.type, discountVal: parseFloat(discountForm.val) || 0 }
        : i
    ));
    setDiscountDialog(null);
  }

  const totals = cart.reduce(
    (acc, item) => {
      const c = computeItem(item, taxRate);
      return {
        subtotal: acc.subtotal + c.gross,
        discount: acc.discount + c.discountUsd,
        tax: acc.tax + c.taxUsd,
        total: acc.total + c.lineTotal,
      };
    },
    { subtotal: 0, discount: 0, tax: 0, total: 0 }
  );

  const totalDisplay = currency === "USD"
    ? formatUSD(totals.total)
    : formatZIG(usdToZig(totals.total, zigRate));

  function openPaymentDialog() {
    if (cart.length === 0) return;
    setCashReceived("");
    setPaymentMethod("CASH");
    setPaymentDialog(true);
  }

  async function completeSale() {
    setPaymentDialog(false);
    // Capture payment info in USD for the receipt
    if (paymentMethod === "CASH") {
      const receivedInCurrency = parseFloat(cashReceived) || 0;
      const receivedUsd = currency === "ZIG" ? receivedInCurrency / zigRate : receivedInCurrency;
      const changeUsd = receivedUsd - totals.total;
      setPaymentInfo({ method: "CASH", cashReceivedUsd: receivedUsd, changeUsd });
    } else {
      setPaymentInfo({ method: paymentMethod });
    }
    setCompleting(true);
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currency,
        exchangeRate: zigRate,
        items: cart.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          unitPriceUsd: i.product.priceUsd,
          discountType: i.discountType,
          discountVal: i.discountVal,
        })),
      }),
    });
    setCompleting(false);
    if (!res.ok) {
      const e = await res.json();
      toast({ title: "Sale failed", description: e.error, variant: "destructive" });
      return;
    }
    const sale = await res.json();
    setCompletedSale(sale);
    setCart([]);
    setSearch("");
    fetchProducts();
  }

  const discountItem = cart.find((i) => i.product.id === discountDialog);

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Left: product search */}
      <div className="flex-1 flex flex-col border-r border-gray-200 bg-white min-h-0">
        <div className="p-4 border-b border-gray-100">
          <h1 className="font-bold text-gray-900 text-lg mb-3">POS · {orgName}</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              ref={searchRef}
              placeholder="Search product, barcode, SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                disabled={product.stockQuantity === 0}
                className="text-left p-3 border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <p className="text-sm font-semibold text-gray-900 line-clamp-2">{product.name}</p>
                <p className="text-blue-600 font-bold text-sm mt-1">{formatUSD(product.priceUsd)}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-gray-400">Qty: {product.stockQuantity}</p>
                  {product.taxExempt && <Badge variant="secondary" className="text-xs py-0">Exempt</Badge>}
                </div>
              </button>
            ))}
            {products.length === 0 && (
              <p className="col-span-full text-center text-gray-400 py-8">No products found</p>
            )}
          </div>
        </div>
      </div>

      {/* Right: cart */}
      <div className="w-full md:w-96 flex flex-col bg-gray-50 border-l border-gray-200">
        <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-blue-600" />
            <span className="font-semibold text-gray-900">Cart</span>
            {cart.length > 0 && (
              <Badge>{cart.reduce((s, i) => s + i.quantity, 0)} items</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-500">Currency:</Label>
            <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="ZIG">ZiG</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {currency === "ZIG" && (
          <div className="mx-4 mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
            Exchange rate: 1 USD = {zigRate} ZiG. Prices shown in ZiG.
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs mt-1">Click a product to add it</p>
            </div>
          ) : (
            cart.map((item) => {
              const c = computeItem(item, taxRate);
              const displayPrice = currency === "USD" ? formatUSD(c.lineTotal) : formatZIG(usdToZig(c.lineTotal, zigRate));
              return (
                <div key={item.product.id} className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.product.name}</p>
                      <p className="text-xs text-gray-500">
                        {currency === "USD" ? formatUSD(item.product.priceUsd) : formatZIG(usdToZig(item.product.priceUsd, zigRate))} each
                      </p>
                      {item.discountType && (
                        <p className="text-xs text-green-600">
                          Discount: {item.discountType === "PERCENTAGE" ? `${item.discountVal}%` : formatUSD(item.discountVal)}
                          {" "}(−{formatUSD(c.discountUsd)})
                        </p>
                      )}
                      {!item.product.taxExempt && (
                        <p className="text-xs text-gray-400">Tax: {formatUSD(c.taxUsd)}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-blue-600">{displayPrice}</p>
                      <button onClick={() => removeItem(item.product.id)} className="text-red-400 hover:text-red-600 mt-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQty(item.product.id, item.quantity - 1)}
                        className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-50"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateQty(item.product.id, parseInt(e.target.value) || 1)}
                        className="w-14 h-7 text-center text-sm px-1"
                      />
                      <button
                        onClick={() => updateQty(item.product.id, item.quantity + 1)}
                        className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-50"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setDiscountForm({ type: "PERCENTAGE", val: item.discountVal.toString() });
                        setDiscountDialog(item.product.id);
                      }}
                      className="text-xs flex items-center gap-1 text-purple-600 hover:text-purple-800"
                    >
                      <Tag className="h-3 w-3" />
                      Discount
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-gray-200 bg-white p-4 space-y-2">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatUSD(totals.subtotal)}</span>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>−{formatUSD(totals.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-600">
                <span>VAT ({taxRate}%)</span>
                <span>{formatUSD(totals.tax)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 text-base border-t pt-2 mt-2">
                <span>Total</span>
                <span className="text-blue-600">{totalDisplay}</span>
              </div>
              {currency === "ZIG" && (
                <p className="text-xs text-gray-400 text-right">{formatUSD(totals.total)} USD equivalent</p>
              )}
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={openPaymentDialog}
              disabled={completing}
            >
              <CheckCircle className="h-5 w-5 mr-2" />
              {completing ? "Processing..." : `Complete Sale · ${totalDisplay}`}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setCart([])}
            >
              <X className="h-4 w-4 mr-1" />
              Clear Cart
            </Button>
          </div>
        )}
      </div>

      {/* Payment dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Payment · {totalDisplay}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Payment method selector */}
            <div>
              <Label className="mb-2 block">Payment Method</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["CASH", "CARD", "MOBILE_MONEY"] as const).map((m) => {
                  const icons = { CASH: Banknote, CARD: CreditCard, MOBILE_MONEY: Smartphone };
                  const labels = { CASH: "Cash", CARD: "Card", MOBILE_MONEY: "EcoCash" };
                  const Icon = icons[m];
                  return (
                    <button
                      key={m}
                      onClick={() => { setPaymentMethod(m); setCashReceived(""); }}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-colors text-sm font-medium ${
                        paymentMethod === m
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {labels[m]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cash flow */}
            {paymentMethod === "CASH" && (() => {
              const totalInCurrency = currency === "USD" ? totals.total : usdToZig(totals.total, zigRate);
              const received = parseFloat(cashReceived) || 0;
              const change = received - totalInCurrency;
              const sym = currency === "USD" ? "$" : "ZiG ";
              return (
                <div className="space-y-3">
                  <div>
                    <Label>Amount Due</Label>
                    <p className="text-2xl font-bold text-blue-600 mt-1">{totalDisplay}</p>
                  </div>
                  <div>
                    <Label htmlFor="cashReceived">Cash Received ({currency})</Label>
                    <Input
                      id="cashReceived"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={`${sym}0.00`}
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      className="text-lg mt-1"
                      autoFocus
                    />
                  </div>
                  {received > 0 && (
                    <div className={`p-3 rounded-lg border ${change >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                      <p className="text-xs text-gray-500 mb-0.5">Change Due</p>
                      <p className={`text-2xl font-bold ${change >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {change >= 0
                          ? (currency === "USD" ? formatUSD(change) : formatZIG(change))
                          : `−${currency === "USD" ? formatUSD(-change) : formatZIG(-change)}`}
                      </p>
                      {change < 0 && <p className="text-xs text-red-500 mt-1">Insufficient — need {currency === "USD" ? formatUSD(-change) : formatZIG(-change)} more</p>}
                    </div>
                  )}
                </div>
              );
            })()}

            {paymentMethod !== "CASH" && (
              <p className="text-sm text-gray-500 text-center py-2">
                {paymentMethod === "CARD" ? "Process card payment for" : "Confirm EcoCash payment of"}{" "}
                <span className="font-semibold text-gray-900">{totalDisplay}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(false)}>Cancel</Button>
            <Button
              onClick={completeSale}
              disabled={completing || (() => {
                if (paymentMethod !== "CASH") return false;
                const due = currency === "USD" ? totals.total : usdToZig(totals.total, zigRate);
                return (parseFloat(cashReceived) || 0) < due - 0.001;
              })()}
            >
              <CheckCircle className="h-4 w-4 mr-1.5" />
              Confirm Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discount dialog */}
      <Dialog open={!!discountDialog} onOpenChange={() => setDiscountDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apply Discount — {discountItem?.product.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Discount Type</Label>
              <Select
                value={discountForm.type}
                onValueChange={(v) => setDiscountForm({ ...discountForm, type: v as "PERCENTAGE" | "FIXED" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENTAGE">
                    <div className="flex items-center gap-2"><Percent className="h-4 w-4" /> Percentage (%)</div>
                  </SelectItem>
                  <SelectItem value="FIXED">
                    <div className="flex items-center gap-2"><DollarSign className="h-4 w-4" /> Fixed Amount (USD)</div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Value {discountForm.type === "PERCENTAGE" ? "(%)" : "(USD)"}</Label>
              <Input
                type="number"
                min="0"
                max={discountForm.type === "PERCENTAGE" ? "100" : undefined}
                value={discountForm.val}
                onChange={(e) => setDiscountForm({ ...discountForm, val: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscountDialog(null)}>Cancel</Button>
            <Button onClick={() => discountDialog && applyDiscount(discountDialog)}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sale complete dialog */}
      {completedSale && (
        <Dialog open onOpenChange={() => { setCompletedSale(null); setPaymentInfo(null); }}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle className="h-5 w-5" />
                Sale Complete!
              </DialogTitle>
            </DialogHeader>
            <ReceiptView
              sale={completedSale}
              orgName={orgName}
              taxRate={taxRate}
              zigRate={zigRate}
              paymentMethod={paymentInfo?.method}
              cashReceived={paymentInfo?.cashReceivedUsd}
              changeGiven={paymentInfo?.changeUsd}
            />
            <DialogFooter className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCompletedSale(null)}>
                New Sale
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
