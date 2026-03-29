# Changelog — WebWaka Real Estate Suite

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

## [0.1.0] — 2026-03-29

### Added
- Canonical WebWaka OS v4 scaffold with all 7 platform invariants enforced
- Cloudflare Worker entry point (`src/worker.ts`) with Hono framework
- `secureCORS()` — environment-aware CORS (no wildcard `origin: '*'`)
- `rateLimit()` — global rate limiting on all auth and mutation endpoints
- `jwtAuthMiddleware()` — JWT validation on all `/api/*` routes
- `requireRole()` — RBAC enforcement on all mutation endpoints
- `tenantId` always sourced from JWT payload — never from headers or body
- Property Listings module: CRUD endpoints with tenant isolation and kobo validation
- Tenancy Management module: tenancy lifecycle + Paystack rent payment integration
- Mortgage Calculator module: amortisation engine with Nigerian NHF rates
- Dexie offline database (`src/db/db.ts`) — Offline First pattern with mutation queue
- i18n stub (`src/i18n/index.ts`) — en-NG default, 7 locales, kobo currency formatting
- Paystack integration (`src/core/paystack.ts`) — kobo-only, Nigeria First
- OpenRouter AI abstraction (`src/core/ai.ts`) — Vendor Neutral AI
- D1 schema migration (`migrations/001_real_estate_schema.sql`) — kobo INTEGER columns
- 5-layer CI/CD pipeline (lint → tests → migrate → deploy → health check)
- 18 unit tests covering kobo validation, tenant isolation, i18n, and Paystack
