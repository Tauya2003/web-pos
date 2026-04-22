import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendReceiptEmail } from "@/lib/email";
import { formatUSD, formatZIG, usdToZig } from "@/lib/utils";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { to } = await req.json();
  if (!to) return NextResponse.json({ error: "Email address required" }, { status: 400 });

  const [sale, org] = await Promise.all([
    db.sale.findFirst({
      where: { id, organizationId: session.user.organizationId },
      include: { items: true, user: true, customer: true },
    }),
    db.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { name: true, address: true, phone: true, taxRate: true, returnPolicy: true },
    }),
  ]);

  if (!sale || !org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isZig = sale.currency === "ZIG";
  const rate = sale.exchangeRate;
  const fmt = (usd: number) => isZig ? formatZIG(usdToZig(usd, rate)) : formatUSD(usd);

  const itemRows = sale.items.map((item) =>
    `<tr>
      <td style="padding:4px 8px;border-bottom:1px solid #eee;">${item.productName} × ${item.quantity}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${fmt(item.lineTotalUsd)}</td>
    </tr>`
  ).join("");

  const html = `
    <div style="font-family:monospace;max-width:400px;margin:auto;border:1px solid #ddd;padding:24px;border-radius:8px;">
      <h2 style="text-align:center;margin:0 0 8px;">${org.name}</h2>
      ${org.address ? `<p style="text-align:center;color:#666;margin:0;">${org.address}</p>` : ""}
      ${org.phone ? `<p style="text-align:center;color:#666;margin:0;">${org.phone}</p>` : ""}
      <hr style="margin:16px 0;" />
      <p><strong>Receipt:</strong> ${sale.receiptNumber}</p>
      <p><strong>Date:</strong> ${new Date(sale.createdAt).toLocaleString()}</p>
      <p><strong>Cashier:</strong> ${sale.user.name}</p>
      <p><strong>Currency:</strong> ${sale.currency}${isZig ? ` (1 USD = ${rate} ZiG)` : ""}</p>
      <hr style="margin:16px 0;" />
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Item</th>
            <th style="text-align:right;padding:4px 8px;border-bottom:2px solid #333;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <hr style="margin:16px 0;" />
      <div style="text-align:right;">
        <p>Subtotal: ${fmt(sale.subtotalUsd)}</p>
        ${sale.discountUsd > 0 ? `<p style="color:green;">Discount: −${fmt(sale.discountUsd)}</p>` : ""}
        <p>VAT (${org.taxRate}%): ${fmt(sale.taxUsd)}</p>
        <h3 style="border-top:2px solid #333;padding-top:8px;">Total: ${fmt(sale.totalUsd)}</h3>
        ${isZig ? `<p style="color:#666;">≈ ${formatUSD(sale.totalUsd)} USD</p>` : ""}
      </div>
      <hr style="margin:16px 0;" />
      <p style="color:#666;font-size:12px;text-align:center;">${org.returnPolicy ?? "No returns after 7 days without receipt."}</p>
      <p style="text-align:center;font-weight:bold;">Thank you for your business!</p>
    </div>
  `;

  try {
    await sendReceiptEmail(session.user.organizationId, to, `Receipt ${sale.receiptNumber} — ${org.name}`, html);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to send email. Check SMTP settings." }, { status: 500 });
  }
}
