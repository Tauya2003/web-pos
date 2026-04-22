"use client";

import { useState, useEffect } from "react";
import { formatUSD, formatZIG, usdToZig } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, Bluetooth } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { printViaBluetooth, getPairedPrinterName, forgetPrinter } from "@/lib/bluetooth-printer";

interface SaleItem {
  productName: string;
  quantity: number;
  unitPriceUsd: number;
  lineTotalUsd: number;
  taxUsd: number;
}

interface SaleData {
  id: string;
  receiptNumber: string;
  totalUsd: number;
  taxUsd: number;
  subtotalUsd: number;
  discountUsd: number;
  currency: "USD" | "ZIG";
  exchangeRate: number;
  createdAt: string;
  items: SaleItem[];
  user: { name: string };
  customer: { name: string; email: string | null } | null;
}

interface Props {
  sale: SaleData;
  orgName: string;
  taxRate: number;
  zigRate: number;
  returnPolicy?: string;
  paymentMethod?: "CASH" | "CARD" | "MOBILE_MONEY";
  cashReceived?: number;
  changeGiven?: number;
}

export function ReceiptView({ sale, orgName, taxRate, zigRate, returnPolicy, paymentMethod, cashReceived, changeGiven }: Props) {
  const isZig = sale.currency === "ZIG";
  const rate = sale.exchangeRate;
  const [pairedPrinter, setPairedPrinter] = useState<string | null>(null);

  useEffect(() => {
    setPairedPrinter(getPairedPrinterName());
  }, []);

  function fmt(usd: number) {
    return isZig ? formatZIG(usdToZig(usd, rate)) : formatUSD(usd);
  }

  async function handleBluetoothPrint(forceNew = false) {
    try {
      await printViaBluetooth(buildEscPos(), forceNew);
      setPairedPrinter(getPairedPrinterName());
      toast({ title: "Sent to printer", variant: "success" });
    } catch (err: unknown) {
      toast({
        title: "Bluetooth print failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  function handleForgetPrinter() {
    forgetPrinter();
    setPairedPrinter(null);
    toast({ title: "Printer disconnected" });
  }

  function buildEscPos(): Uint8Array {
    const lines: string[] = [
      orgName.toUpperCase(),
      "================================",
      `Receipt: ${sale.receiptNumber}`,
      `Date:    ${new Date(sale.createdAt).toLocaleString()}`,
      `Cashier: ${sale.user.name}`,
      sale.customer ? `Customer: ${sale.customer.name}` : "",
      "--------------------------------",
      ...sale.items.map(
        (i) => `${i.productName.substring(0, 18).padEnd(18)} x${i.quantity}  ${fmt(i.lineTotalUsd)}`
      ),
      "--------------------------------",
      `Subtotal: ${fmt(sale.subtotalUsd)}`,
      sale.discountUsd > 0 ? `Discount: -${fmt(sale.discountUsd)}` : "",
      `VAT(${taxRate}%): ${fmt(sale.taxUsd)}`,
      `TOTAL:    ${fmt(sale.totalUsd)}`,
      isZig ? `(≈ ${formatUSD(sale.totalUsd)} at rate ${rate})` : "",
      "--------------------------------",
      paymentMethod ? `Payment:  ${paymentMethod === "MOBILE_MONEY" ? "EcoCash" : paymentMethod === "CARD" ? "Card" : "Cash"}` : "",
      paymentMethod === "CASH" && cashReceived != null ? `Received: ${fmt(cashReceived)}` : "",
      paymentMethod === "CASH" && changeGiven != null ? `Change:   ${fmt(changeGiven)}` : "",
      "================================",
      returnPolicy ?? "No returns after 7 days.",
      "",
      "Thank you for your business!",
      "\n\n\n",
    ].filter(Boolean);

    const text = lines.join("\n");
    const encoder = new TextEncoder();
    const ESC = 0x1b;
    const GS = 0x1d;
    const init = new Uint8Array([ESC, 0x40]);
    const cut = new Uint8Array([GS, 0x56, 0x42, 0x00]);
    const body = encoder.encode(text);
    const result = new Uint8Array(init.length + body.length + cut.length);
    result.set(init, 0);
    result.set(body, init.length);
    result.set(cut, init.length + body.length);
    return result;
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 font-mono text-xs space-y-1">
        <p className="text-center font-bold text-base">{orgName.toUpperCase()}</p>
        <p className="text-center text-gray-500">━━━━━━━━━━━━━━━━━━━━━━━━━━━━</p>
        <div className="flex justify-between text-gray-600">
          <span>Receipt:</span><span className="font-bold">{sale.receiptNumber}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Date:</span><span>{new Date(sale.createdAt).toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Cashier:</span><span>{sale.user.name}</span>
        </div>
        {sale.customer && (
          <div className="flex justify-between text-gray-600">
            <span>Customer:</span><span>{sale.customer.name}</span>
          </div>
        )}
        <div className="flex justify-between items-center mt-1">
          <span className="text-gray-500">Currency:</span>
          <Badge variant={isZig ? "warning" : "default"}>{sale.currency}</Badge>
        </div>
        {isZig && (
          <p className="text-gray-400 text-right">Rate: 1 USD = {rate} ZiG</p>
        )}
        <p className="text-gray-400">━━━━━━━━━━━━━━━━━━━━━━━━━━━━</p>
        {sale.items.map((item, idx) => (
          <div key={idx} className="flex justify-between">
            <span className="flex-1 truncate pr-2">{item.productName} x{item.quantity}</span>
            <span>{fmt(item.lineTotalUsd)}</span>
          </div>
        ))}
        <p className="text-gray-400">━━━━━━━━━━━━━━━━━━━━━━━━━━━━</p>
        <div className="flex justify-between text-gray-600">
          <span>Subtotal:</span><span>{fmt(sale.subtotalUsd)}</span>
        </div>
        {sale.discountUsd > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Discount:</span><span>−{fmt(sale.discountUsd)}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-600">
          <span>VAT ({taxRate}%):</span><span>{fmt(sale.taxUsd)}</span>
        </div>
        <div className="flex justify-between font-bold text-base border-t border-gray-300 pt-1 mt-1">
          <span>TOTAL:</span><span className="text-blue-700">{fmt(sale.totalUsd)}</span>
        </div>
        {isZig && (
          <p className="text-right text-gray-400">≈ {formatUSD(sale.totalUsd)} USD</p>
        )}
        {paymentMethod && (
          <>
            <p className="text-gray-400">━━━━━━━━━━━━━━━━━━━━━━━━━━━━</p>
            <div className="flex justify-between text-gray-600">
              <span>Payment:</span>
              <span>{paymentMethod === "MOBILE_MONEY" ? "EcoCash" : paymentMethod === "CARD" ? "Card" : "Cash"}</span>
            </div>
            {paymentMethod === "CASH" && cashReceived != null && (
              <div className="flex justify-between text-gray-600">
                <span>Received:</span><span>{fmt(cashReceived)}</span>
              </div>
            )}
            {paymentMethod === "CASH" && changeGiven != null && (
              <div className="flex justify-between font-semibold text-green-700">
                <span>Change:</span><span>{fmt(changeGiven)}</span>
              </div>
            )}
          </>
        )}
        <p className="text-gray-400 text-center mt-2">━━━━━━━━━━━━━━━━━━━━━━━━━━━━</p>
        <p className="text-gray-500 text-center text-xs italic">
          {returnPolicy ?? "No returns after 7 days without receipt."}
        </p>
        <p className="text-center font-bold text-xs mt-1">Thank you for your business!</p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1" />
          System Print
        </Button>
        <div className="flex-1 flex flex-col gap-1">
          <Button variant="outline" size="sm" className="w-full" onClick={() => handleBluetoothPrint(false)}>
            <Bluetooth className="h-4 w-4 mr-1" />
            {pairedPrinter ? `Print · ${pairedPrinter}` : "BT Printer"}
          </Button>
          {pairedPrinter && (
            <div className="flex gap-1">
              <button
                onClick={() => handleBluetoothPrint(true)}
                className="flex-1 text-xs text-blue-600 hover:underline text-center"
              >
                Change printer
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={handleForgetPrinter}
                className="flex-1 text-xs text-red-500 hover:underline text-center"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
