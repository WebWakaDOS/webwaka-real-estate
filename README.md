# WebWaka Real Estate Suite

Property listings, tenancy management, and mortgage tools built for the Nigerian and African real estate market on the WebWaka OS v4 platform.

## Platform Invariants

This repository enforces all 7 WebWaka OS v4 platform invariants without exception:

| Invariant | Implementation |
|---|---|
| **Build Once Use Infinitely** | All auth primitives from `@webwaka/core`. Zero re-implementation. |
| **Mobile First** | Hono lightweight API, Cloudflare Workers edge runtime |
| **PWA First** | Cloudflare Workers + Pages deployment |
| **Offline First** | Dexie IndexedDB offline store with mutation queue sync |
| **Nigeria First** | Paystack kobo integers, en-NG default locale, Nigerian states/LGAs |
| **Africa First** | 7-locale i18n (en-NG, en-GH, en-KE, en-ZA, fr-CI, yo-NG, ha-NG) |
| **Vendor Neutral AI** | OpenRouter abstraction only — no vendor SDK imports |

## Architecture

The suite is a Cloudflare Worker built with Hono, backed by Cloudflare D1 (SQLite), KV (sessions + rate limiting), and R2 (property media). All monetary values are stored as **kobo integers** (NGN × 100) in the database.

## Modules

**Property Listings** (`/api/properties`) manages the full lifecycle of property records — residential, commercial, land, and industrial — across sale, rent, and shortlet listing types. All write operations require `PROPERTY_AGENT` role or above, and every query enforces `tenant_id` isolation sourced exclusively from the JWT payload.

**Tenancy Management** (`/api/tenancy`) handles tenancy records and integrates with Paystack for rent collection. Rent and deposit amounts are validated as positive kobo integers at the API boundary.

**Mortgage Calculator** (`/api/mortgage`) provides an amortisation engine pre-loaded with Nigerian reference rates from the NHF (6%), Federal Mortgage Bank, and commercial banks. All calculations use kobo integers throughout.

## Security

Authentication is enforced globally on all `/api/*` routes via `jwtAuthMiddleware` from `@webwaka/core`. CORS is environment-aware via `secureCORS()` — wildcard `origin: '*'` is strictly prohibited. Rate limiting is applied to all auth endpoints. The `tenantId` is always extracted from the validated JWT payload and is never accepted from request headers or body parameters.

## Getting Started

```bash
npm install
npm test          # run all tests
npm run typecheck # TypeScript check
npm run dev       # local development
```

## Required Secrets

Configure via `wrangler secret put <KEY> --env <staging|production>`:

- `JWT_SECRET` — shared JWT signing secret (must match `webwaka-super-admin-v2`)
- `PAYSTACK_SECRET_KEY` — Paystack secret key
- `OPENROUTER_API_KEY` — OpenRouter API key
- `TERMII_API_KEY` — Termii SMS API key

## Deployment

```bash
npm run deploy:staging    # deploy to staging
npm run deploy:production # deploy to production
```
