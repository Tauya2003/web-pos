import { Pool } from "pg";
import { readFileSync } from "fs";

// Load .env manually
const env = readFileSync(".env", "utf-8");
env.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) process.env[k.trim()] = v.join("=").replace(/^"|"$/g, "").trim();
});

const ORG_ID = "cmo8ebd1n0000d8v939amcb1r";

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

async function seed() {
  console.log("Seeding inventory for The Green Shop...\n");

  // Categories
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

  // Products: [name, sku, priceUsd, category, stock, lowStockThreshold, taxExempt]
  const products = [
    // Groceries
    ["Roller Meal 5kg",      "GRC-001", 3.50,  "Groceries",            50, 10, false],
    ["Rice 2kg",             "GRC-002", 2.80,  "Groceries",            40, 10, false],
    ["Cooking Oil 2L",       "GRC-003", 4.20,  "Groceries",            30, 8,  false],
    ["Sugar 2kg",            "GRC-004", 2.20,  "Groceries",            45, 10, false],
    ["Salt 500g",            "GRC-005", 0.75,  "Groceries",            60, 15, false],
    ["Baked Beans 410g",     "GRC-006", 1.10,  "Groceries",            35, 8,  false],
    ["Tomato Paste 400g",    "GRC-007", 0.90,  "Groceries",            40, 10, false],
    ["Spaghetti 500g",       "GRC-008", 1.30,  "Groceries",            30, 8,  false],

    // Beverages
    ["Coke 500ml",           "BEV-001", 0.90,  "Beverages",            80, 20, false],
    ["Sprite 500ml",         "BEV-002", 0.90,  "Beverages",            60, 20, false],
    ["Fanta Orange 500ml",   "BEV-003", 0.90,  "Beverages",            60, 20, false],
    ["Mazoe Orange 2L",      "BEV-004", 3.50,  "Beverages",            25, 8,  false],
    ["Tanganda Tea 100 bags","BEV-005", 2.80,  "Beverages",            30, 8,  false],
    ["Nescafe 100g",         "BEV-006", 5.50,  "Beverages",            15, 5,  false],
    ["Mineral Water 750ml",  "BEV-007", 0.60,  "Beverages",            100,25, false],

    // Dairy & Eggs
    ["Fresh Milk 1L",        "DAI-001", 1.40,  "Dairy & Eggs",         40, 10, false],
    ["Eggs (tray of 30)",    "DAI-002", 5.50,  "Dairy & Eggs",         20, 5,  false],
    ["Butter 250g",          "DAI-003", 2.20,  "Dairy & Eggs",         20, 5,  false],
    ["Yoghurt 500ml",        "DAI-004", 1.80,  "Dairy & Eggs",         15, 5,  false],
    ["Cheese 200g",          "DAI-005", 3.20,  "Dairy & Eggs",         10, 3,  false],

    // Bakery
    ["Bread (sliced loaf)",  "BAK-001", 1.20,  "Bakery",               30, 10, false],
    ["Brown Bread",          "BAK-002", 1.30,  "Bakery",               20, 8,  false],
    ["Scones (6 pack)",      "BAK-003", 1.50,  "Bakery",               15, 5,  false],

    // Household
    ["Dish Soap 750ml",      "HSE-001", 1.80,  "Household",            25, 5,  false],
    ["Washing Powder 1kg",   "HSE-002", 2.50,  "Household",            20, 5,  false],
    ["Bleach 750ml",         "HSE-003", 1.20,  "Household",            20, 5,  false],
    ["Toilet Paper (4 roll)","HSE-004", 2.00,  "Household",            35, 8,  false],
    ["Matches (box)",        "HSE-005", 0.30,  "Household",            50, 15, false],

    // Personal Care
    ["Vaseline 250ml",       "PRC-001", 2.50,  "Personal Care",        20, 5,  false],
    ["Sunlight Soap 150g",   "PRC-002", 0.80,  "Personal Care",        40, 10, false],
    ["Colgate Toothpaste",   "PRC-003", 2.20,  "Personal Care",        25, 5,  false],
    ["Dettol 250ml",         "PRC-004", 3.50,  "Personal Care",        15, 5,  false],

    // Snacks
    ["Chompkins Crisps",     "SNK-001", 0.50,  "Snacks & Confectionery",60,15, false],
    ["Proton Biscuits",      "SNK-002", 0.80,  "Snacks & Confectionery",50,12, false],
    ["Dairibord Ice Cream",  "SNK-003", 1.50,  "Snacks & Confectionery",20, 5,  false],
    ["Bar One Chocolate",    "SNK-004", 1.20,  "Snacks & Confectionery",30, 8,  false],
    ["Chewing Gum (strip)",  "SNK-005", 0.25,  "Snacks & Confectionery",80,20, false],
  ];

  let created = 0, skipped = 0;
  for (const [name, sku, priceUsd, category, stock, lowStock, taxExempt] of products) {
    const existing = await q(`SELECT id FROM "Product" WHERE "organizationId"=$1 AND sku=$2`, [ORG_ID, sku]);
    if (existing.length) { skipped++; continue; }
    const id = cuid();
    await q(
      `INSERT INTO "Product" (id, "organizationId", "categoryId", name, sku, "priceUsd", "taxExempt", "stockQuantity", "lowStockThreshold", active, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,NOW(),NOW())`,
      [id, ORG_ID, catIds[category], name, sku, priceUsd, taxExempt, stock, lowStock]
    );
    created++;
  }

  console.log(`\n✓ Done! ${created} products created, ${skipped} already existed.`);
  await pool.end();
}

seed().catch((e) => { console.error(e.message); pool.end(); process.exit(1); });
