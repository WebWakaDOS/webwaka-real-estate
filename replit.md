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

## T-RES-01: ESVARBON Agent Verification (implemented)

### Overview
Agents must be verified against the ESVARBON register before they can publish listings or be assigned to listings.

### Verification State Machine
```
unverified → pending_api  → verified   (esvarbon_api method)
unverified → pending_docs → manual_review → verified  (manual method)
                                          → rejected
```

### Key Invariants
- **Nigeria-First fallback:** If `ESVARBON_API_URL` is not set or the API is unavailable, agents move to `manual_review` queue — admins verify uploaded documents instead.
- **Listing publication gate:** Agents with `verification_status != 'verified'` are blocked with HTTP 403 from creating listings.
- **Assignment gate:** Unverified agents cannot be assigned to any listing.
- **Multi-tenant:** Every query is scoped by `tenant_id`.

### New API Endpoints
- `GET  /api/re/agents/pending-verification` — Admin queue of agents awaiting manual review
- `GET  /api/re/agents?verification_status=<status>` — Filter agents by verification state
- `POST /api/re/agents/:id/documents` — Upload ESVARBON certificate to R2 (multipart/form-data)
- `POST /api/re/agents/:id/verify` — Trigger automated ESVARBON API check → auto-fallback to manual_review
- `POST /api/re/agents/:id/verification/approve` — Admin manual approval
- `POST /api/re/agents/:id/verification/reject` — Admin manual rejection (with reason)

### New Files
- `migrations/002_agent_verification.sql` — Adds 9 new columns + index to `re_agents`
- `src/modules/agents/esvarbon.ts` — ESVARBON API service with graceful fallback
- `src/modules/agents/esvarbon.test.ts` — 10 service tests
- `src/modules/agents/api/index.test.ts` — 19 API tests

### Environment Variables (optional)
- `ESVARBON_API_URL` — Base URL for ESVARBON verification API (if available)
- `ESVARBON_API_KEY` — Bearer token for the ESVARBON API

### Verified Agent Badge
- `GET /api/re/listings` includes `has_verified_agent: boolean` per result
- `GET /api/re/listings/:id` includes `is_verified_badge` per agent and `has_verified_agent` at listing level
- `GET /api/re/listings?verified_agents_only=1` filters to listings with verified agents only

## Deployment

Deploys to Cloudflare Workers via `wrangler`:
- `npm run deploy:staging` — staging environment
- `npm run deploy:production` — production environment

Secrets must be set via `wrangler secret put <KEY> --env <staging|production>`:
- `JWT_SECRET`
- `PAYSTACK_SECRET_KEY`
- `INTER_SERVICE_SECRET`
