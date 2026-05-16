/**
 * Seed demo inventory + ensure admin login for a specific organization.
 * Edit ORG_ID / ADMIN_EMAIL / ADMIN_PASSWORD at the top, then:
 *   node scripts/seed-org-account.mjs
 */
import { Pool } from "pg";
import { readFileSync } from "fs";

const ORG_ID = "cmoyqqub80000p8v98drp2wll";
const ADMIN_EMAIL = "jane@black.com";
const ADMIN_PASSWORD = "password";
const ADMIN_NAME = "Jane Black";

// Load .env manually (same pattern as seed-green-shop.mjs)
const env = readFileSync(".env", "utf-8");
env.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) process.env[k.trim()] = v.join("=").replace(/^"|"$/g, "").trim();
});

const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete("schema");
const pool = new Pool({ connectionString: url.toString() });

function cuid() {
  return "c" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

async function q(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

/** Match `src/app/api/sales/route.ts` line math (no item discounts). */
function lineParts(unitPriceUsd, quantity, taxExempt, taxRatePct) {
  const lineGross = unitPriceUsd * quantity;
  const discountUsd = 0;
  const afterDiscount = lineGross;
  const taxRate = taxExempt ? 0 : taxRatePct / 100;
  const taxUsd = afterDiscount * taxRate;
  const lineTotalUsd = afterDiscount + taxUsd;
  return { lineGross, discountUsd, taxUsd, lineTotalUsd };
}

async function seedSalesAndReturns() {
  const seeded = await q(
    `SELECT id FROM "Sale" WHERE "organizationId" = $1 AND "receiptNumber" = $2 LIMIT 1`,
    [ORG_ID, "SEED-RCP-001"]
  );
  if (seeded.length) {
    console.log("\nSales/returns seed skipped (receipt SEED-RCP-001 already exists).");
    return;
  }

  const [user] = await q(`SELECT id FROM "User" WHERE "organizationId" = $1 AND email = $2`, [ORG_ID, ADMIN_EMAIL]);
  if (!user) {
    console.warn("\nNo user for sales seed; skipping.");
    return;
  }

  const [org] = await q(`SELECT "taxRate", "zigRate" FROM "Organization" WHERE id = $1`, [ORG_ID]);
  const taxRate = org?.taxRate ?? 15;
  const zigRate = org?.zigRate ?? 36;

  const custRows = await q(
    `SELECT id, name FROM "Customer" WHERE "organizationId" = $1 AND name IN ($2, $3)`,
    [ORG_ID, "Tendai Moyo", "Rudo Chikwanha"]
  );
  const custId = (name) => custRows.find((r) => r.name === name)?.id ?? null;

  const skus = ["BEV-001", "BAK-001", "GRC-002", "GRC-003", "DAI-001", "SNK-001", "PRC-002"];
  const products = await q(
    `SELECT id, name, sku, "priceUsd", "taxExempt" FROM "Product" WHERE "organizationId" = $1 AND sku = ANY($2::text[])`,
    [ORG_ID, skus]
  );
  const bySku = Object.fromEntries(products.map((p) => [p.sku, p]));
  for (const sku of skus) {
    if (!bySku[sku]) {
      console.warn(`\nMissing product SKU ${sku}; cannot seed sales/returns.`);
      return;
    }
  }

  const salesDef = [
    {
      receipt: "SEED-RCP-001",
      daysAgo: 5,
      customerId: custId("Tendai Moyo"),
      notes: "Demo seed sale",
      items: [
        { sku: "BEV-001", qty: 4 },
        { sku: "BAK-001", qty: 2 },
      ],
    },
    {
      receipt: "SEED-RCP-002",
      daysAgo: 7,
      customerId: custId("Rudo Chikwanha"),
      notes: "Demo seed — bulk groceries",
      items: [
        { sku: "GRC-002", qty: 3 },
        { sku: "GRC-003", qty: 1 },
        { sku: "DAI-001", qty: 1 },
      ],
    },
    {
      receipt: "SEED-RCP-003",
      daysAgo: 2,
      customerId: null,
      notes: "Demo seed — walk-in",
      items: [
        { sku: "SNK-001", qty: 5 },
        { sku: "PRC-002", qty: 3 },
      ],
    },
  ];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const saleIdByReceipt = {};
    const saleItemsByReceipt = {};

    for (const def of salesDef) {
      let subtotalUsd = 0;
      let discountUsd = 0;
      let taxUsd = 0;
      const computed = [];

      for (const { sku, qty } of def.items) {
        const p = bySku[sku];
        const unitPriceUsd = p.priceUsd;
        const { lineGross, discountUsd: dUsd, taxUsd: tUsd, lineTotalUsd } = lineParts(
          unitPriceUsd,
          qty,
          p.taxExempt,
          taxRate
        );
        subtotalUsd += lineGross;
        discountUsd += dUsd;
        taxUsd += tUsd;
        computed.push({ ...p, qty, unitPriceUsd, discountUsd: dUsd, taxUsd: tUsd, lineTotalUsd });
      }

      const totalUsd = subtotalUsd - discountUsd + taxUsd;
      const saleId = cuid();

      await client.query(
        `INSERT INTO "Sale" (id, "organizationId", "receiptNumber", "userId", "customerId", currency, "exchangeRate", "subtotalUsd", "discountUsd", "taxUsd", "totalUsd", notes, voided, "createdAt")
         VALUES ($1,$2,$3,$4,$5,$6::"Currency",$7,$8,$9,$10,$11,$12,false,NOW() - $13::interval)`,
        [
          saleId,
          ORG_ID,
          def.receipt,
          user.id,
          def.customerId,
          "USD",
          1,
          subtotalUsd,
          discountUsd,
          taxUsd,
          totalUsd,
          def.notes,
          `${def.daysAgo} days`,
        ]
      );

      const itemRows = [];
      for (const row of computed) {
        const itemId = cuid();
        await client.query(
          `INSERT INTO "SaleItem" (id, "saleId", "productId", "productName", quantity, "unitPriceUsd", "discountType", "discountVal", "discountUsd", "taxUsd", "lineTotalUsd")
           VALUES ($1,$2,$3,$4,$5,$6,null,0,$7,$8,$9)`,
          [
            itemId,
            saleId,
            row.id,
            row.name,
            row.qty,
            row.unitPriceUsd,
            row.discountUsd,
            row.taxUsd,
            row.lineTotalUsd,
          ]
        );
        itemRows.push({
          id: itemId,
          productId: row.id,
          sku: row.sku,
          qty: row.qty,
          unitPriceUsd: row.unitPriceUsd,
          taxExempt: row.taxExempt,
        });
        await client.query(`UPDATE "Product" SET "stockQuantity" = "stockQuantity" - $1, "updatedAt" = NOW() WHERE id = $2`, [
          row.qty,
          row.id,
        ]);
      }

      saleIdByReceipt[def.receipt] = saleId;
      saleItemsByReceipt[def.receipt] = itemRows;
    }

    const sale2 = saleItemsByReceipt["SEED-RCP-002"];
    const riceItem = sale2.find((i) => i.sku === "GRC-002");
    const ret1Qty = 2;
    const r1 = lineParts(riceItem.unitPriceUsd, ret1Qty, riceItem.taxExempt, taxRate);
    const ret1Id = cuid();
    await client.query(
      `INSERT INTO "Return" (id, "organizationId", "saleId", "userId", "customerId", reason, "refundMethod", "refundUsd", currency, "exchangeRate", "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,'CASH',$7,'USD'::"Currency",$8,NOW() - INTERVAL '6 days')`,
      [
        ret1Id,
        ORG_ID,
        saleIdByReceipt["SEED-RCP-002"],
        user.id,
        custId("Rudo Chikwanha"),
        "Demo seed: customer brought extra bags back unused",
        r1.lineTotalUsd,
        zigRate,
      ]
    );
    await client.query(
      `INSERT INTO "ReturnItem" (id, "returnId", "saleItemId", "productId", quantity, "refundUsd")
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [cuid(), ret1Id, riceItem.id, riceItem.productId, ret1Qty, r1.lineTotalUsd]
    );
    await client.query(`UPDATE "Product" SET "stockQuantity" = "stockQuantity" + $1, "updatedAt" = NOW() WHERE id = $2`, [
      ret1Qty,
      riceItem.productId,
    ]);

    const sale3 = saleItemsByReceipt["SEED-RCP-003"];
    const crispItem = sale3.find((i) => i.sku === "SNK-001");
    const ret2Qty = 2;
    const r2 = lineParts(crispItem.unitPriceUsd, ret2Qty, crispItem.taxExempt, taxRate);
    const ret2Id = cuid();
    await client.query(
      `INSERT INTO "Return" (id, "organizationId", "saleId", "userId", "customerId", reason, "refundMethod", "refundUsd", currency, "exchangeRate", "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,'STORE_CREDIT',$7,'USD'::"Currency",$8,NOW() - INTERVAL '1 day')`,
      [
        ret2Id,
        ORG_ID,
        saleIdByReceipt["SEED-RCP-003"],
        user.id,
        null,
        "Demo seed: wrong flavour picked",
        r2.lineTotalUsd,
        zigRate,
      ]
    );
    await client.query(
      `INSERT INTO "ReturnItem" (id, "returnId", "saleItemId", "productId", quantity, "refundUsd")
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [cuid(), ret2Id, crispItem.id, crispItem.productId, ret2Qty, r2.lineTotalUsd]
    );
    await client.query(`UPDATE "Product" SET "stockQuantity" = "stockQuantity" + $1, "updatedAt" = NOW() WHERE id = $2`, [
      ret2Qty,
      crispItem.productId,
    ]);

    await client.query("COMMIT");
    console.log("\nSeeded 3 demo sales (SEED-RCP-001…003) and 2 returns with stock adjusted.");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  const bcrypt = (await import("bcryptjs")).default;
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const orgs = await q(`SELECT id, name FROM "Organization" WHERE id = $1`, [ORG_ID]);
  if (!orgs.length) {
    console.error(`No organization with id ${ORG_ID}.`);
    process.exit(1);
  }
  console.log(`Organization: ${orgs[0].name} (${ORG_ID})\n`);

  const existingUser = await q(
    `SELECT id FROM "User" WHERE "organizationId" = $1 AND email = $2`,
    [ORG_ID, ADMIN_EMAIL]
  );
  if (existingUser.length) {
    await q(
      `UPDATE "User" SET "passwordHash" = $1, role = 'ADMIN', active = true, name = $2, "updatedAt" = NOW() WHERE id = $3`,
      [passwordHash, ADMIN_NAME, existingUser[0].id]
    );
    console.log(`Updated admin user: ${ADMIN_EMAIL}`);
  } else {
    const uid = cuid();
    await q(
      `INSERT INTO "User" (id, "organizationId", name, email, "passwordHash", role, active, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'ADMIN', true, NOW(), NOW())`,
      [uid, ORG_ID, ADMIN_NAME, ADMIN_EMAIL, passwordHash]
    );
    console.log(`Created admin user: ${ADMIN_EMAIL}`);
  }

  const categories = [
    { name: "Groceries" },
    { name: "Beverages" },
    { name: "Dairy & Eggs" },
    { name: "Bakery" },
    { name: "Household" },
    { name: "Personal Care" },
    { name: "Snacks & Confectionery" },
  ];

  const catIds = {};
  for (const cat of categories) {
    const existing = await q(`SELECT id FROM "Category" WHERE "organizationId"=$1 AND name=$2`, [ORG_ID, cat.name]);
    if (existing.length) {
      catIds[cat.name] = existing[0].id;
      console.log(`  Category exists: ${cat.name}`);
    } else {
      const id = cuid();
      await q(`INSERT INTO "Category" (id, "organizationId", name, "createdAt") VALUES ($1,$2,$3,NOW())`, [id, ORG_ID, cat.name]);
      catIds[cat.name] = id;
      console.log(`  Created category: ${cat.name}`);
    }
  }

  const products = [
    ["Roller Meal 5kg", "GRC-001", 3.5, "Groceries", 50, 10, false],
    ["Rice 2kg", "GRC-002", 2.8, "Groceries", 40, 10, false],
    ["Cooking Oil 2L", "GRC-003", 4.2, "Groceries", 30, 8, false],
    ["Sugar 2kg", "GRC-004", 2.2, "Groceries", 45, 10, false],
    ["Salt 500g", "GRC-005", 0.75, "Groceries", 60, 15, false],
    ["Baked Beans 410g", "GRC-006", 1.1, "Groceries", 35, 8, false],
    ["Tomato Paste 400g", "GRC-007", 0.9, "Groceries", 40, 10, false],
    ["Spaghetti 500g", "GRC-008", 1.3, "Groceries", 30, 8, false],
    ["Coke 500ml", "BEV-001", 0.9, "Beverages", 80, 20, false],
    ["Sprite 500ml", "BEV-002", 0.9, "Beverages", 60, 20, false],
    ["Fanta Orange 500ml", "BEV-003", 0.9, "Beverages", 60, 20, false],
    ["Mazoe Orange 2L", "BEV-004", 3.5, "Beverages", 25, 8, false],
    ["Tanganda Tea 100 bags", "BEV-005", 2.8, "Beverages", 30, 8, false],
    ["Nescafe 100g", "BEV-006", 5.5, "Beverages", 15, 5, false],
    ["Mineral Water 750ml", "BEV-007", 0.6, "Beverages", 100, 25, false],
    ["Fresh Milk 1L", "DAI-001", 1.4, "Dairy & Eggs", 40, 10, false],
    ["Eggs (tray of 30)", "DAI-002", 5.5, "Dairy & Eggs", 20, 5, false],
    ["Butter 250g", "DAI-003", 2.2, "Dairy & Eggs", 20, 5, false],
    ["Yoghurt 500ml", "DAI-004", 1.8, "Dairy & Eggs", 15, 5, false],
    ["Cheese 200g", "DAI-005", 3.2, "Dairy & Eggs", 10, 3, false],
    ["Bread (sliced loaf)", "BAK-001", 1.2, "Bakery", 30, 10, false],
    ["Brown Bread", "BAK-002", 1.3, "Bakery", 20, 8, false],
    ["Scones (6 pack)", "BAK-003", 1.5, "Bakery", 15, 5, false],
    ["Dish Soap 750ml", "HSE-001", 1.8, "Household", 25, 5, false],
    ["Washing Powder 1kg", "HSE-002", 2.5, "Household", 20, 5, false],
    ["Bleach 750ml", "HSE-003", 1.2, "Household", 20, 5, false],
    ["Toilet Paper (4 roll)", "HSE-004", 2.0, "Household", 35, 8, false],
    ["Matches (box)", "HSE-005", 0.3, "Household", 50, 15, false],
    ["Vaseline 250ml", "PRC-001", 2.5, "Personal Care", 20, 5, false],
    ["Sunlight Soap 150g", "PRC-002", 0.8, "Personal Care", 40, 10, false],
    ["Colgate Toothpaste", "PRC-003", 2.2, "Personal Care", 25, 5, false],
    ["Dettol 250ml", "PRC-004", 3.5, "Personal Care", 15, 5, false],
    ["Chompkins Crisps", "SNK-001", 0.5, "Snacks & Confectionery", 60, 15, false],
    ["Proton Biscuits", "SNK-002", 0.8, "Snacks & Confectionery", 50, 12, false],
    ["Dairibord Ice Cream", "SNK-003", 1.5, "Snacks & Confectionery", 20, 5, false],
    ["Bar One Chocolate", "SNK-004", 1.2, "Snacks & Confectionery", 30, 8, false],
    ["Chewing Gum (strip)", "SNK-005", 0.25, "Snacks & Confectionery", 80, 20, false],
  ];

  let created = 0;
  let skipped = 0;
  for (const [name, sku, priceUsd, category, stock, lowStock, taxExempt] of products) {
    const existing = await q(`SELECT id FROM "Product" WHERE "organizationId"=$1 AND sku=$2`, [ORG_ID, sku]);
    if (existing.length) {
      skipped++;
      continue;
    }
    const id = cuid();
    await q(
      `INSERT INTO "Product" (id, "organizationId", "categoryId", name, sku, "priceUsd", "taxExempt", "stockQuantity", "lowStockThreshold", active, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,NOW(),NOW())`,
      [id, ORG_ID, catIds[category], name, sku, priceUsd, taxExempt, stock, lowStock]
    );
    created++;
  }

  const sampleCustomers = [
    ["Tendai Moyo", "tendai@example.com", "+263771000001"],
    ["Rudo Chikwanha", "rudo@example.com", "+263772000002"],
  ];
  for (const [name, email, phone] of sampleCustomers) {
    const hit = await q(`SELECT id FROM "Customer" WHERE "organizationId"=$1 AND name=$2`, [ORG_ID, name]);
    if (hit.length) continue;
    await q(
      `INSERT INTO "Customer" (id, "organizationId", name, email, phone, "createdAt") VALUES ($1,$2,$3,$4,$5,NOW())`,
      [cuid(), ORG_ID, name, email, phone]
    );
    console.log(`  Customer: ${name}`);
  }

  await seedSalesAndReturns();

  console.log(`\nDone. ${created} products created, ${skipped} SKUs already present.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  pool.end();
  process.exit(1);
});
