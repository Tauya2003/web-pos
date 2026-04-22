# ZimPOS — Web-based POS for Zimbabwe SMEs

## Stack
- **Framework**: Next.js 16 (App Router, Turbopack)
- **ORM**: Prisma 7 with `@prisma/adapter-pg` (required in Prisma 7 — no `url` in schema.prisma)
- **Auth**: NextAuth v5 beta (credentials — email/password for admins, PIN for cashiers)
- **DB**: PostgreSQL (multi-tenant via `organizationId` on every table)
- **Styling**: Tailwind CSS v4 + hand-built shadcn-style components in `src/components/ui/`
- **Email**: Nodemailer (SMTP configured per organization in settings)
- **Bluetooth printing**: Web Bluetooth API (Chrome/Edge only) with ESC/POS in `src/lib/bluetooth-printer.ts`

## Key architecture notes
- **Multi-tenancy**: Row-level isolation. Every query must filter by `organizationId` from session.
- **Currency**: All prices stored in USD. ZiG is display-only, converted at `org.zigRate` at query time.
- **Prisma 7**: datasource has no `url` in schema.prisma — it lives in `prisma.config.ts`. Runtime uses `PrismaPg` adapter.
- **Proxy file**: Next.js 16 uses `src/proxy.ts` instead of `src/middleware.ts` for route protection.
- **ZodError**: v4 uses `.issues[0].message` not `.errors[0].message`.

## Running locally
```bash
# 1. Set DATABASE_URL and AUTH_SECRET in .env
# 2. Run migrations
npx prisma migrate dev

# 3. Start dev server
npm run dev
```

## Environment variables
```
DATABASE_URL=postgresql://...
AUTH_SECRET=...     # generate: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
```

## Data model summary
- `Organization` — tenant root (has zigRate, taxRate, SMTP config)
- `User` — admin (password) or cashier (PIN), scoped to org
- `Product` — priceUsd, stockQuantity, lowStockThreshold, taxExempt
- `Category` — product grouping
- `Sale` + `SaleItem` — completed transactions, currency + exchangeRate recorded at time of sale
- `Return` + `ReturnItem` — partial/full returns with refund method (CASH, STORE_CREDIT, MOBILE_MONEY)
- `Customer` — optional, linkable to sales/returns

## Key API routes
- `POST /api/register` — create org + admin user
- `GET/POST /api/products` — list/create products
- `POST /api/sales` — complete a sale (validates stock, calculates tax, reduces inventory in transaction)
- `POST /api/returns` — process return (validates quantities vs original sale, restores inventory)
- `GET /api/reports/sales` — sales summary with byDay breakdown
- `GET /api/reports/stock` — stock levels with isLowStock flag
- `PATCH /api/settings` — update org settings (zigRate, taxRate, SMTP, business info)
- `POST /api/sales/[id]/email-receipt` — send HTML receipt via configured SMTP
