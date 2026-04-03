# WebWaka Real Estate API

## Project Overview

A Cloudflare Workers backend for the WebWaka OS v4 platform, providing a unified API for the Nigerian real estate market. Covers property listings, transaction lifecycle, and agent management with ESVARBON compliance.

## Architecture

- **Runtime:** Cloudflare Workers (serverless edge)
- **Framework:** Hono (lightweight web framework)
- **Database:** Cloudflare D1 (SQLite-based)
- **Storage:** Cloudflare R2 (property images and documents)
- **Cache/Config:** Cloudflare KV (tenant config, rate limiting)
- **Payments:** Paystack (with HMAC-SHA512 webhook verification)
- **Auth:** JWT + RBAC via `@webwaka/core`
- **Package Manager:** npm
- **TypeScript:** Primary language

## Module Routes

- `GET/POST /api/re/listings/*` — Property listings CRUD and search
- `GET/PATCH/DELETE /api/re/listings/:id/*` — Listing detail and image management
- `GET/POST /api/re/transactions/*` — Transaction lifecycle
- `POST /api/re/webhooks/paystack` — Paystack webhook (no auth)
- `GET/POST /api/re/agents/*` — Agent profiles and ESVARBON compliance
- `GET /health` — Health check

## Key Design Decisions

- All monetary values stored as integers in **kobo** (NGN × 100) to avoid floating-point errors
- Multi-tenancy via `tenant_id` extracted from JWT
- RBAC enforced via `requireRole` middleware (`admin`, `agent`, `super_admin`)

## Local Development

Run `npm run dev` which starts `wrangler dev` on port 5000 with local mode (simulated D1/R2/KV).

Local D1 database is initialized via: `wrangler d1 execute webwaka-real-estate-local --local --file=migrations/001_real_estate_schema.sql`

Local dev JWT_SECRET is set to `dev-secret-change-in-production` in `wrangler.toml`.

## Deployment

Deploys to Cloudflare Workers via `wrangler`:
- `npm run deploy:staging` — staging environment
- `npm run deploy:production` — production environment

Secrets must be set via `wrangler secret put <KEY> --env <staging|production>`:
- `JWT_SECRET`
- `PAYSTACK_SECRET_KEY`
- `INTER_SERVICE_SECRET`
