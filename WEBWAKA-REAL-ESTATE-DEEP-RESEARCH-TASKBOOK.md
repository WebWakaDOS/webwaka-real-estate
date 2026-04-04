# WEBWAKA-REAL-ESTATE — DEEP RESEARCH + ENHANCEMENT TASKBOOK + QA PROMPT FACTORY

**Repository:** `webwaka-real-estate`
**Platform:** WebWaka OS v4 (Multi-Repo Architecture)
**Runtime:** Cloudflare Workers + Hono + D1 + R2 + KV
**Vertical:** Nigerian Real Estate — Property Listings, Transactions, Agent Management
**Date:** 2026-04-04
**Classification:** Implementation-Ready Taskbook

---

# TABLE OF CONTENTS

1. Repo Deep Understanding
2. External Best-Practice Research
3. Synthesis and Gap Analysis
4. Top 20 Enhancements
5. Bug Fix Recommendations
6. Task Breakdown (Tasks T-RE-ENH-01 through T-RE-ENH-22)
7. QA Plans
8. Implementation Prompt for Each Task
9. QA Prompt for Each Task
10. Priority Order
11. Dependencies
12. Phase 1 / Phase 2 Split
13. Repo Context and Ecosystem Notes
14. Governance and Reminder Block
15. Execution Readiness Notes

---

# SECTION 1 — REPO DEEP UNDERSTANDING

## 1.1 Repository Identity

- **Repo name:** `webwaka-real-estate`
- **Role in ecosystem:** The Real Estate vertical within WebWaka OS v4. This repo is a standalone Cloudflare Worker that provides backend API services for property listings, transactions, and agent management. It does NOT contain a frontend — the frontend (PWA/mobile) lives in a separate WebWaka frontend repo.
- **Entry point:** `src/worker.ts`
- **Framework:** Hono v4.12.9 on Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite semantics)
- **File Storage:** Cloudflare R2
- **KV:** Cloudflare KV (tenant config, rate limit — currently configured but NOT used in any handler)
- **Payments:** Paystack (webhook-only currently — no charge initiation)
- **Auth:** `@webwaka/core` — `jwtAuthMiddleware`, `requireRole`, `getTenantId`
- **Testing:** Vitest (in-process mocks, no actual D1/R2)
- **CI/CD:** GitHub Actions (`.github/workflows/deploy.yml`)

## 1.2 Module Structure

```
src/
├── worker.ts                          # Unified entry point + global health check
└── modules/
    ├── listings/
    │   └── api/index.ts               # Listings CRUD + agent verification gate
    ├── transactions/
    │   └── api/index.ts               # Transaction lifecycle + Paystack webhook
    └── agents/
        ├── api/index.ts               # Agent profiles + ESVARBON verification lifecycle
        ├── api/index.test.ts          # Agent API tests (17 cases, well-covered)
        ├── esvarbon.ts                # ESVARBON API client + manual fallback
        └── esvarbon.test.ts           # ESVARBON unit tests (10 cases, well-covered)
```

## 1.3 Database Schema (migrations/)

**Migration 001 — Core Schema:**
- `re_listings` — Property listings (sale/rent/shortlet), integer kobo pricing, GPS coordinates, tenant-scoped
- `re_listing_images` — R2 references for property photos (sort_order, is_primary, caption)
- `re_inquiries` — Buyer/renter inquiries (table exists, NO API routes implemented)
- `re_agents` — Estate agent profiles with ESVARBON fields
- `re_agent_listings` — Many-to-many: agents assigned to listings (role: primary/co-agent)
- `re_transactions` — Sale/rent transactions with full monetary breakdown in kobo
- `re_payments` — Paystack payment records (idempotent by `paystack_reference`)

**Migration 002 — Agent Verification:**
Adds 9 columns to `re_agents`: `verification_status`, `verification_method`, `esvarbon_doc_key`, `esvarbon_doc_uploaded_at`, `esvarbon_api_raw`, `verified_at`, `verified_by`, `rejection_reason`, `verification_requested_at`

**State machine for agent verification:**
```
unverified → pending_api → verified (esvarbon_api method)
unverified → pending_docs → manual_review → verified (manual method)
                                          → rejected
           ← (document re-upload resets rejected → pending_docs)
```

## 1.4 API Surface

**Listings Module (`/api/re/listings`):**
| Method | Route | Auth | Status |
|--------|-------|------|--------|
| GET | /api/re/listings | Public (or JWT) | ✅ Implemented |
| GET | /api/re/listings/:id | Public (or JWT) | ✅ Implemented |
| POST | /api/re/listings | agent/admin | ✅ Implemented |
| PATCH | /api/re/listings/:id | agent/admin | ✅ Implemented |
| DELETE | /api/re/listings/:id | admin | ✅ Implemented (soft delete) |
| POST | /api/re/listings/:id/images | agent/admin | ❌ MISSING — route not implemented |
| DELETE | /api/re/listings/:id/images/:imageId | agent/admin | ❌ MISSING — route not implemented |

**Transactions Module (`/api/re/transactions`):**
| Method | Route | Auth | Status |
|--------|-------|------|--------|
| GET | /api/re/transactions | admin/agent | ✅ Implemented |
| GET | /api/re/transactions/:id | admin/agent | ✅ Implemented |
| POST | /api/re/transactions | admin/agent | ✅ Implemented |
| PATCH | /api/re/transactions/:id/status | admin | ✅ Implemented |
| POST | /api/re/webhooks/paystack | None (sig-verified) | ✅ Implemented |

**Agents Module (`/api/re/agents`):**
| Method | Route | Auth | Status |
|--------|-------|------|--------|
| GET | /api/re/agents | admin | ✅ Implemented |
| GET | /api/re/agents/pending-verification | admin | ✅ Implemented |
| GET | /api/re/agents/:id | admin/agent | ✅ Implemented |
| POST | /api/re/agents | admin | ✅ Implemented |
| PATCH | /api/re/agents/:id | admin | ✅ Implemented |
| POST | /api/re/agents/:id/documents | admin/agent | ✅ Implemented |
| POST | /api/re/agents/:id/verify | admin | ✅ Implemented |
| POST | /api/re/agents/:id/verification/approve | admin | ✅ Implemented |
| POST | /api/re/agents/:id/verification/reject | admin | ✅ Implemented |
| POST | /api/re/agents/:id/listings/:listingId | admin | ✅ Implemented |
| DELETE | /api/re/agents/:id/listings/:listingId | admin | ✅ Implemented |

**Inquiries Module:** ❌ Fully MISSING — Schema table `re_inquiries` exists but zero API routes

## 1.5 Test Coverage

| Module | Tests | Status |
|--------|-------|--------|
| ESVARBON service | 10 cases | ✅ Good |
| Agents API | 17 cases | ✅ Good |
| Listings API | 0 cases | ❌ None |
| Transactions API | 0 cases | ❌ None |
| Worker routing | 0 cases | ❌ None |
| Inquiries API | 0 cases | ❌ None (no API exists) |

## 1.6 CI/CD Status

GitHub Actions workflow (`.github/workflows/deploy.yml`) defines:
- `lint-and-test` → type-check (`|| true`), lint (`|| true`), test (`|| true`)
- `preview` → deploy to staging per PR
- `deploy-staging` → runs on `develop` branch push
- `deploy-production` → runs on `main` branch push + GitHub Release

**CRITICAL BUG:** All three critical quality gates (tsc, lint, test) are `|| true` — failures are silently ignored. CI always passes regardless of actual failures. No linting configuration (eslint) exists in the repo.

## 1.7 Known Gaps and Bugs (Identified)

1. **Listing image upload/delete routes** — documented in JSDoc comments but not implemented
2. **Inquiries API** — schema exists, no routes
3. **Rate limiting** — KV binding `RATE_LIMIT_KV` exists in wrangler.toml but never used in code
4. **No geolocation search** — lat/lng stored but no bounding box or Haversine proximity queries
5. **No full-text search** — listing titles/descriptions searched only by exact city match
6. **No cursor-based pagination** — offset/limit only (poor for large, frequently-changing datasets)
7. **No observability** — no request logging, no error tracking middleware
8. **No global error handler** — uncaught exceptions return raw 500s with no structured error body
9. **No Paystack charge initiation** — only webhook handling; no API to create a Paystack charge
10. **CI silent failures** — all quality gates use `|| true`
11. **No ESLint configuration** — lint step in CI runs a non-existent `npm run lint`
12. **No audit log** — verification state transitions not recorded in append-only log table
13. **NDPR/NDPA compliance** — inquiry forms collect PII (name, phone, email) with no consent tracking
14. **No R2 signed URL generation** — agent documents stored in R2 have no secure retrieval endpoint
15. **No event emission** — no inter-service events when transactions complete or agents verified
16. **ID generation uses Math.random()** — not collision-safe for high-throughput multi-tenant use
17. **Agent ownership check missing** — any `agent` role can PATCH any listing, not just their own
18. **Webhook replay protection** — idempotency check is correct but only for `charge.success`; other Paystack events are silently ignored
19. **No shortlet availability/calendar** — shortlet listing type exists but no date-blocking API
20. **No property valuation or market analytics** — no price-per-sqm analysis, no market summary endpoint
21. **RATE_LIMIT_KV never used** — the binding exists but no rate-limit middleware is wired
22. **D1 migrations not running in local dev** — wrangler.toml doesn't configure migration directory

## 1.8 Dependencies on Other WebWaka Repos

- **`@webwaka/core`** — Shared auth middleware. `jwtAuthMiddleware`, `requireRole`, `getTenantId` are all imported from this package. If `@webwaka/core` changes its JWT shape (e.g., how `tenant_id` is carried in the token), this repo breaks silently.
- **WebWaka Event Bus** — This repo produces events that should be consumed by other repos (e.g., `transaction.completed`, `agent.verified`). Currently, no event emission exists. Other repos that depend on these events (e.g., notifications service, analytics) receive nothing.
- **WebWaka Frontend** — The PWA/mobile frontend repo consumes this API. The `has_verified_agent` badge field and the `is_verified_badge` agent field are produced here for frontend rendering.
- **WebWaka Auth/Identity** — JWT tokens issued by a separate auth repo. The `user_id` (`sub`) and `tenant_id` carried in JWT tokens originate from the auth/identity service.
- **WebWaka Notifications** — Agent verification status changes (approve/reject) and inquiry submissions should trigger notifications to agents/admins. Currently, no notification events are emitted.

---

# SECTION 2 — EXTERNAL BEST-PRACTICE RESEARCH

## 2.1 Nigerian Proptech Market Context

**Market size:** ~$2B projected, Nigeria housing deficit of ~22 million units. Leading platforms: PropertyPro.ng, PrivateProperty.com.ng, Buyam. These platforms demonstrate:
- Neighbourhood/LGA filtering (not just city)
- Verified agent badge systems with public trust scores
- Virtual tour integration
- Price comparison and market trend data
- WhatsApp CTA integration (critical in Nigerian market)
- Multi-language support (English, Yoruba, Igbo, Hausa)
- Offline-browsing capability (low-bandwidth market)

## 2.2 Real Estate API Standards

**RESO (Real Estate Standards Organization) Web API:** Industry standard for real estate data interchange. Key patterns:
- OData-compatible query syntax for filtering
- Standardized property type taxonomies
- Cursor-based pagination with `@odata.nextLink`
- Standardized field naming (ListPrice, ListingId, etc.)
- Media resource endpoints for images
- Required fields: ListingKey, ModificationTimestamp, StandardStatus

**Transaction Lifecycle Best Practices:**
Industry-standard states: `lead` → `under_contract` → `pending` → `closed` (or `cancelled`). Missing from current implementation: `under_offer` state progression, document collection states, title check states.

## 2.3 Cloudflare Workers + D1 Production Patterns

**Key production patterns discovered:**
- D1 supports FTS5 (Full Text Search) with `fts5` extension — use lowercase in CREATE VIRTUAL TABLE
- D1 batch operations via `db.batch([])` — reduces round trips significantly
- D1 has 10ms CPU time soft limit per request for Workers free tier; Paid has 30ms
- KV should be used for high-read, low-write config (tenant settings, feature flags)
- R2 + Cloudflare Image Resizing for property photos (resize on the fly, cache at edge)
- Cloudflare Analytics Engine for structured telemetry from Workers
- Durable Objects for rate limiting (better than KV for per-IP counters)

## 2.4 Geospatial Search in SQLite/D1

**Three-layer funnel approach:**
1. **Bounding box pre-filter** — `WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?` (uses index)
2. **Haversine distance filter** — `6371 * acos(cos(lat1)*cos(lat2)*cos(lng2-lng1)+sin(lat1)*sin(lat2))`
3. **Result ranking by distance** — sort by computed distance ASC

D1/SQLite does not natively support R*Tree spatial indexing without extensions. The bounding box + Haversine approach works well for the Nigerian market scale.

## 2.5 FTS5 Full-Text Search in D1

D1 supports FTS5. Pattern:
```sql
CREATE VIRTUAL TABLE re_listings_fts USING fts5(
  title, description, address, city, state, lga,
  content='re_listings', content_rowid='rowid'
);
```
Triggers keep the FTS table in sync with the main table. Search queries:
```sql
SELECT l.* FROM re_listings l
JOIN re_listings_fts fts ON fts.rowid = l.rowid
WHERE re_listings_fts MATCH ? ORDER BY rank;
```

## 2.6 Paystack Best Practices for Real Estate

**Beyond webhook-only pattern:**
- Use Paystack's `initialize` endpoint to create payment links from the API
- Pass `metadata.tenant_id` and `metadata.transaction_id` in the initialization call (already partially done via webhook metadata extraction)
- Use Paystack Split Payments for agency commission distribution
- Use Paystack Transfer API for agent payouts (complements NIBSS NIP in webwaka-fintech)
- Paystack Subscription API for rent collection automation (recurring monthly payments)
- Webhook events to handle beyond `charge.success`: `charge.failed`, `transfer.success`, `transfer.failed`, `refund.processed`

## 2.7 Security and Rate Limiting

**Hono on Cloudflare Workers — rate limiting patterns:**
- Cloudflare's native Rate Limiting Rules (WAF-level) — configured in Cloudflare dashboard, not in code
- KV-based rate limiting (current approach has the KV binding ready but unused)
- Durable Objects-based rate limiting (more accurate, no race conditions)
- For real estate APIs: rate limit listing search (prevent scraping), inquiry submission, and payment initiation

**Authentication security:**
- JWT expiry enforcement (check `exp` claim)
- Tenant isolation must be enforced at every query — never trust client-provided `tenant_id` without JWT verification
- Agent ownership checks: an `agent` role user should only modify their own listings

## 2.8 Offline-First PWA for African Markets

**Key patterns for Nigerian/African markets:**
- 92% data reduction for PWAs vs. native apps (Konga case study)
- Dexie.js for IndexedDB (type-safe, version-managed)
- Background sync for inquiry submissions when offline
- Property image caching with Service Worker `Cache API`
- Offline listing browsing with stale-while-revalidate

Note: This repo is backend-only. The PWA implementation lives in the frontend repo. However, the API design must support offline-first patterns (pagination tokens, ETags, conditional requests).

## 2.9 NDPA 2023 Compliance Requirements

Nigeria Data Protection Act 2023 (replacing NDPR 2019, effective September 2025 with GAID):
- **Lawful basis required** for processing buyer PII (name, phone, email in inquiries)
- **Consent must be explicit** — cannot be bundled with T&Cs
- **Data subject rights**: access, rectification, erasure, portability
- **Retention limits**: PII must not be retained longer than necessary
- **Data Processor notification**: real estate platforms processing buyer data for landlords/agents must have Data Processing Agreements (DPAs)
- **Security requirements**: encryption at rest and in transit for PII
- **Breach notification**: 72 hours to NDPC

## 2.10 Observability for Cloudflare Workers

**Structured logging pattern for Hono:**
```typescript
app.use('*', async (c, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);
  await next();
  const duration = Date.now() - start;
  console.log(JSON.stringify({
    requestId, method: c.req.method,
    path: c.req.path, status: c.res.status,
    duration, tenant_id: getTenantId(c),
  }));
});
```
- Cloudflare Analytics Engine for metrics (latency histograms, error rates per module)
- Cloudflare Logpush for log export to SIEM/data warehouse
- `app.onError()` for global exception capture with structured JSON

---

# SECTION 3 — SYNTHESIS AND GAP ANALYSIS

## 3.1 What Is Well-Implemented

| Feature | Quality |
|---------|---------|
| ESVARBON verification state machine | Excellent — two paths (API + manual), graceful degradation |
| Monetary integrity (kobo) | Excellent — enforced at API and DB level |
| Multi-tenancy | Good — tenant_id on all queries and tables |
| JWT auth via @webwaka/core | Good — consistent across all modules |
| Paystack webhook verification (HMAC-SHA512) | Good — cryptographically correct |
| Agent test coverage | Good — 27 test cases |
| Verified agent publication gate | Excellent — dual enforcement (create listing + assign agent) |
| CI/CD pipeline structure | Good — structure is correct |

## 3.2 Critical Missing Features

| Gap | Impact | Priority |
|-----|--------|----------|
| Listing image upload routes not implemented | Very High — schema and docs reference them | P1 |
| Inquiries API entirely missing | Very High — schema table exists, no routes | P1 |
| No Paystack charge initiation | High — payment flow incomplete | P1 |
| CI quality gates silently fail | High — CI gives false confidence | P1 |
| No rate limiting | High — API vulnerable to scraping/abuse | P1 |
| No global error handler | High — uncaught errors expose raw stack traces | P1 |
| Agent can patch any listing (no ownership check) | High — security vulnerability | P1 |
| No observability/logging | Medium — blind in production | P2 |
| No geolocation search | Medium — core proptech feature | P2 |
| No FTS5 full-text search | Medium — poor search UX | P2 |
| No cursor-based pagination | Medium — offset breaks on large datasets | P2 |
| No R2 signed URLs for documents | Medium — agent docs not retrievable | P2 |
| No audit log for state transitions | Medium — compliance gap | P2 |
| No event emission (inter-service) | Medium — other repos get no signals | P2 |
| No shortlet calendar/availability | Low-Medium — shortlet type exists but unusable | P3 |
| No market analytics endpoints | Low-Medium — proptech expectation | P3 |
| NDPA consent tracking missing | Medium — legal compliance | P2 |
| ID generation not collision-safe | Low — Math.random() at scale | P2 |
| No ESLint configuration | Low — code quality | P3 |
| No property valuation integration | Low | P3 |

---

# SECTION 4 — TOP 20 ENHANCEMENTS

**ENH-01:** Implement listing image upload and delete routes (complete the documented but missing R2 image management API)

**ENH-02:** Build a complete Inquiries API (CRUD on `re_inquiries` table — buyer/renter lead capture and status tracking)

**ENH-03:** Add Paystack charge initiation endpoint (create payment links from the API so frontend can redirect buyers to Paystack checkout)

**ENH-04:** Fix CI/CD quality gates (remove all `|| true` flags; add ESLint config; ensure tsc, lint, and test actually block merges on failure)

**ENH-05:** Implement rate limiting middleware using the existing `RATE_LIMIT_KV` binding (protect search, inquiry, and payment endpoints)

**ENH-06:** Add global error handler and structured request logging middleware (Hono `app.onError()` + JSON request log)

**ENH-07:** Fix agent listing ownership check (prevent `agent` role users from patching listings they are not assigned to)

**ENH-08:** Implement geolocation search (bounding box + Haversine proximity queries using existing lat/lng columns)

**ENH-09:** Add FTS5 full-text search for listings (migration + trigger + search endpoint using D1's FTS5 support)

**ENH-10:** Replace offset pagination with cursor-based pagination on all list endpoints

**ENH-11:** Add R2 signed URL generation endpoint for agent documents (secure, time-limited presigned URLs)

**ENH-12:** Build verification audit log (append-only `re_agent_verification_log` table recording every state transition)

**ENH-13:** Emit inter-service events via KV or outbound fetch after key domain events (`transaction.completed`, `agent.verified`, `inquiry.submitted`)

**ENH-14:** Add shortlet calendar availability API (block-out dates, availability check endpoint)

**ENH-15:** Implement NDPA consent tracking for inquiry submissions (consent field + timestamp + version)

**ENH-16:** Replace Math.random() ID generation with crypto.randomUUID() throughout all modules

**ENH-17:** Add market analytics endpoints (price-per-sqm by state/city, listing count by type, average price trends)

**ENH-18:** Add ESLint configuration with TypeScript rules and run lint in CI with zero-tolerance failure

**ENH-19:** Add comprehensive test coverage for listings and transactions modules (vitest, matching the quality of agent tests)

**ENH-20:** Add Paystack subscription support for automated rent collection (recurring payments for rental transactions)

---

# SECTION 5 — BUG FIX RECOMMENDATIONS

**BUG-01 — CI Silent Failure:** All three quality gates in `.github/workflows/deploy.yml` use `|| true`, meaning type errors, lint errors, and test failures all pass CI silently. Fix: remove `|| true` from `tsc`, lint, and test steps.

**BUG-02 — Missing Listing Image Routes:** `src/modules/listings/api/index.ts` documents `POST /api/re/listings/:id/images` and `DELETE /api/re/listings/:id/images/:imageId` in its JSDoc comment but neither route handler exists. The upload route is critical as listing images cannot be added.

**BUG-03 — Agent Ownership Gap:** The `PATCH /api/re/listings/:id` route only requires `agent` role but does NOT verify that the requesting agent is assigned to the listing. Any verified agent with a JWT can update any listing in the tenant. Fix: query `re_agent_listings` to confirm assignment before allowing agent-level updates.

**BUG-04 — RATE_LIMIT_KV Unused:** The KV namespace `RATE_LIMIT_KV` is declared in `wrangler.toml` and bound in the worker but no route or middleware uses it. The name implies rate limiting was planned but never implemented, leaving the API completely unprotected from abuse.

**BUG-05 — No Global Error Handler:** If any handler throws an unhandled exception, Cloudflare Workers will return a generic 500 response. There is no `app.onError()` registered anywhere. The response body may expose internal error messages in development environments.

**BUG-06 — INSERT OR REPLACE on re_agent_listings:** The `POST /api/re/agents/:id/listings/:listingId` handler uses `INSERT OR REPLACE` which silently replaces existing rows. This changes the primary key (the new `assignId` is different from the original), potentially orphaning history. Fix: use `INSERT OR IGNORE` or check for existence first.

**BUG-07 — Paystack Metadata Dependency:** The webhook handler extracts `tenant_id` and `transaction_id` from `data.metadata`. If Paystack sends a `charge.success` event without these fields (e.g., payments created outside the platform), the webhook silently does nothing. There is no logging or alerting for metadata-missing events.

**BUG-08 — wrangler.toml Missing Migrations Config:** The `wrangler.toml` does not configure a `migrations_dir`. This means `wrangler d1 migrations apply` may not work correctly without explicit `--file` flags. Fix: add `migrations_dir = "migrations"` to wrangler.toml.

**BUG-09 — No Vitest Config File:** The repo uses `vitest` but has no `vitest.config.ts`. The Cloudflare Workers test environment requires specific setup (`@cloudflare/vitest-pool-workers` or `miniflare`). Currently tests mock the bindings manually, which is brittle. A proper vitest config with the cloudflare pool would make tests more realistic.

**BUG-10 — getTenantId Fallback Inconsistency:** In listings, `getTenantId(c) ?? c.req.query('tenant_id')` allows `tenant_id` to come from a query parameter for public routes. This is correct. But the fallback means an unauthenticated caller can spoof any tenant_id on public GET endpoints. For public listing search, this is acceptable, but it must be documented explicitly and not extended to write routes.

---

# SECTION 6 — TASK BREAKDOWN

---

## TASK T-RE-ENH-01 — Implement Listing Image Upload and Delete Routes

**Title:** Implement R2-backed listing image upload and delete routes

**Objective:** Implement the two missing route handlers documented in the listings module JSDoc: `POST /api/re/listings/:id/images` (upload image to R2, record in `re_listing_images`) and `DELETE /api/re/listings/:id/images/:imageId` (remove from R2 and DB).

**Why It Matters:** Without this, property listings cannot have images. This is a fundamental feature of any real estate platform. The schema table, CI references, and README all assume these routes exist.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** `@webwaka/core` for auth, Cloudflare R2 binding (`DOCUMENTS`)

**Prerequisites:** Migration 001 already creates `re_listing_images`. No new migrations required.

**Impacted Modules:** `src/modules/listings/api/index.ts`

**Likely Files to Change:**
- `src/modules/listings/api/index.ts` — Add two route handlers

**Expected Output:**
- `POST /api/re/listings/:id/images` — Accepts multipart/form-data with `image` file. Validates type (jpeg/png/webp), size (max 10MB). Uploads to R2 at key `listings/{tenantId}/{listingId}/img_{ts}.{ext}`. Inserts row in `re_listing_images`. If no primary image exists for the listing, sets `is_primary = 1`.
- `DELETE /api/re/listings/:id/images/:imageId` — Fetches R2 key from DB, deletes from R2, deletes DB row. If deleted image was primary, promotes next image to primary.

**Acceptance Criteria:**
- POST returns 201 with `{ image_id, r2_key, is_primary, sort_order }`
- DELETE returns 200 with `{ success: true }`
- Files rejected if wrong type or oversized
- Primary image promotion works correctly
- tenant_id enforced on all DB queries
- Agent role restricted to their own listings (per ENH-07 ownership check)

**Tests Required:**
- Upload valid JPEG — returns 201, R2.put called, DB row inserted
- Upload invalid type (e.g., GIF) — returns 400
- Upload oversized file — returns 400
- Delete existing image — R2.delete called, DB row removed
- Delete non-existent image — returns 404
- Primary promotion: deleting primary image promotes next in sort_order

**Risks:** R2 key naming collision (mitigated by timestamp). Large file uploads consume CPU time in Workers.

**Governance Docs to Consult:** Blueprint Part 9.2 (R2 storage patterns), `@webwaka/core` README for auth patterns

**Important Reminders:**
- All monetary values remain in kobo — images do not touch monetary fields
- tenant_id must scope ALL DB queries
- This is backend-only; the frontend consuming these routes lives in a separate repo

**Phase:** Phase 1

---

## TASK T-RE-ENH-02 — Build Complete Inquiries API

**Title:** Implement the Inquiries module API (`/api/re/inquiries`)

**Objective:** Build a full CRUD API for property inquiries using the existing `re_inquiries` schema table. Buyers/renters submit inquiries; agents/admins manage the inquiry pipeline with status tracking.

**Why It Matters:** The `re_inquiries` table was designed and migrated in migration 001 but no API routes exist. Inquiry capture is a primary revenue-generating action in real estate platforms — it's the first touchpoint for buyer-agent interaction.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** `@webwaka/core`, `re_inquiries` schema

**Prerequisites:** Migration 001 (already deployed). NDPA consent field addition (see T-RE-ENH-15 — implement together or add consent fields to this task).

**Impacted Modules:** New file `src/modules/inquiries/api/index.ts`, `src/worker.ts` (add routing)

**Likely Files to Change:**
- Create `src/modules/inquiries/api/index.ts`
- Create `src/modules/inquiries/api/index.test.ts`
- Update `src/worker.ts` to route `/api/re/inquiries/*`

**Expected Output:**
- `POST /api/re/inquiries` — Public (no auth required). Accepts inquirer name, phone, email (optional), message, listing_id. Validates listing exists. Inserts into `re_inquiries`. Emits event (if event bus available).
- `GET /api/re/inquiries` — Admin/agent. List inquiries for tenant with filter by `listing_id`, `status`, pagination.
- `GET /api/re/inquiries/:id` — Admin/agent. Get inquiry detail.
- `PATCH /api/re/inquiries/:id/status` — Admin/agent. Update inquiry status (new → contacted → viewing_scheduled → closed).

**Acceptance Criteria:**
- POST requires name, phone, listing_id; email optional
- POST validates listing exists and is active
- GET list supports filtering by listing_id, status
- PATCH enforces valid status transitions
- tenant_id enforced throughout
- Pagination on list endpoint (cursor-based per T-RE-ENH-10)

**Tests Required:**
- Submit inquiry with valid data — 201 returned
- Submit inquiry for non-existent listing — 404
- Submit inquiry missing required fields — 400
- List inquiries filtered by status — correct results
- Update status to valid value — 200
- Update status to invalid value — 400

**Risks:** PII exposure in GET responses — ensure agent-level access is scoped to their own listings' inquiries

**Governance Docs:** Blueprint Part 9.2 (Multi-Tenancy), NDPA 2023 (PII handling)

**Important Reminders:**
- Public POST route must NOT require JWT (buyers submit without accounts)
- Phone number is PII — ensure NDPA consent field is present
- This module is a new routing subtree — add to `worker.ts`

**Phase:** Phase 1

---

## TASK T-RE-ENH-03 — Add Paystack Charge Initiation Endpoint

**Title:** Implement Paystack payment link initialization for transactions

**Objective:** Add `POST /api/re/transactions/:id/pay` which calls the Paystack Initialize API to create a checkout URL, passing `metadata.tenant_id` and `metadata.transaction_id` so the webhook can correctly associate the payment.

**Why It Matters:** The current flow handles Paystack webhooks (payment confirmed) but has no way to initiate a payment. Frontend has no endpoint to call to start a payment flow. The transaction lifecycle is incomplete.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** Paystack API (`https://api.paystack.co/transaction/initialize`), `PAYSTACK_SECRET_KEY` env var

**Prerequisites:** Transaction must exist in `initiated` status. `PAYSTACK_SECRET_KEY` must be set.

**Impacted Modules:** `src/modules/transactions/api/index.ts`

**Likely Files to Change:**
- `src/modules/transactions/api/index.ts` — Add new route handler

**Expected Output:**
- `POST /api/re/transactions/:id/pay` — Fetches transaction from DB, builds Paystack initialize payload with `amount` (total_payable_kobo), `email` (buyer_email or required field), `metadata: { tenant_id, transaction_id }`, calls Paystack, returns `{ authorization_url, access_code, reference }`.

**Acceptance Criteria:**
- Returns Paystack `authorization_url` for the exact transaction amount
- `metadata` includes `tenant_id` and `transaction_id` for webhook correlation
- Returns 400 if transaction already has `payment_status = paid`
- Returns 503 if Paystack API is unreachable
- Paystack secret key never exposed in response
- Amount sent to Paystack matches `total_payable_kobo`

**Tests Required:**
- Valid transaction → Paystack initialize called with correct amount and metadata
- Transaction already paid → 400 returned
- Missing PAYSTACK_SECRET_KEY → structured error returned
- Paystack API failure → 503 with user-friendly error

**Risks:** Paystack API rate limits; partial payment scenarios (buyer pays multiple times)

**Governance Docs:** Blueprint Part 9.2 (Monetary Integrity), Paystack API docs

**Important Reminders:**
- Amount to Paystack must equal `total_payable_kobo` — no float conversion
- `metadata.tenant_id` is CRITICAL for webhook routing
- Do not store the Paystack authorization_url in the DB (it expires)

**Phase:** Phase 1

---

## TASK T-RE-ENH-04 — Fix CI/CD Quality Gates and Add ESLint

**Title:** Remove `|| true` from CI quality steps and add ESLint configuration

**Objective:** Fix the GitHub Actions workflow so that TypeScript type errors, lint errors, and test failures actually block merges. Add an ESLint configuration with TypeScript rules.

**Why It Matters:** Currently CI always passes regardless of code quality. This gives false confidence and allows bugs, type errors, and broken tests to reach production silently.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`

**Prerequisites:** None

**Impacted Modules:** `.github/workflows/deploy.yml`, new `eslint.config.js`, `package.json`

**Likely Files to Change:**
- `.github/workflows/deploy.yml` — Remove `|| true` from tsc, lint, test steps
- Create `eslint.config.js` — flat ESLint config with TypeScript rules
- `package.json` — add lint script, add ESLint devDependencies

**Expected Output:**
- ESLint config covering TypeScript files with `@typescript-eslint/recommended` rules
- `npm run lint` runs ESLint and exits non-zero on errors
- CI `lint-and-test` job fails if tsc fails, lint fails, or any test fails
- PR cannot merge if quality gates fail

**Acceptance Criteria:**
- `npm run lint` runs without errors on clean codebase
- `npm run type-check` runs without errors
- `npm test` passes all 27 existing tests
- CI workflow fails on intentionally introduced error
- No `|| true` remains on quality gate steps

**Tests Required:**
- Manual: Introduce a TypeScript error → CI should fail
- Manual: Introduce a lint violation → CI should fail
- Manual: Break a test → CI should fail

**Risks:** Existing code may have lint violations requiring fixes before `|| true` can be removed

**Governance Docs:** CI/CD Native Development principle

**Important Reminders:**
- Fix all existing lint violations BEFORE removing `|| true`
- Keep separate jobs for lint and test to allow parallelism

**Phase:** Phase 1

---

## TASK T-RE-ENH-05 — Implement Rate Limiting Middleware

**Title:** Wire up RATE_LIMIT_KV for per-tenant, per-IP rate limiting on sensitive endpoints

**Objective:** Implement rate limiting middleware using the existing `RATE_LIMIT_KV` binding to protect listing search (anti-scraping), inquiry submission (anti-spam), and payment initiation endpoints.

**Why It Matters:** The API is currently completely unprotected from scraping, spam inquiry submissions, and abuse. The KV binding was clearly planned for this purpose but never implemented.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** `RATE_LIMIT_KV` KV namespace (already bound in wrangler.toml)

**Prerequisites:** None

**Impacted Modules:** `src/modules/listings/api/index.ts`, `src/modules/inquiries/api/index.ts`, `src/modules/transactions/api/index.ts`

**Likely Files to Change:**
- Create `src/middleware/rateLimit.ts` — reusable rate limit middleware factory
- `src/modules/listings/api/index.ts` — apply to GET /listings
- `src/modules/inquiries/api/index.ts` — apply to POST /inquiries
- `src/modules/transactions/api/index.ts` — apply to POST /transactions/:id/pay

**Expected Output:**
Rate limit middleware:
- Key: `rate:{ip}:{route}` (or `rate:{tenant_id}:{route}` for authenticated routes)
- Sliding window: configurable (e.g., 60 requests/minute for search, 5/minute for inquiry submit)
- On limit exceeded: returns `429 Too Many Requests` with `Retry-After` header
- Uses KV `get`/`put` with TTL for counter storage

**Acceptance Criteria:**
- Search endpoint returns 429 after exceeding 60 req/min
- Inquiry POST returns 429 after exceeding 5 req/min per IP
- 429 response includes `Retry-After: {seconds}` header
- Authenticated routes use tenant_id as part of the key
- Middleware is composable and reusable across modules

**Tests Required:**
- First N requests pass (within limit)
- Request N+1 returns 429
- After TTL expires, counter resets
- Retry-After header present on 429
- Different routes/tenants have independent counters

**Risks:** KV writes have ~100ms latency — high-frequency rate limiting may add latency. Use `waitUntil` for non-blocking counter updates where appropriate.

**Governance Docs:** Blueprint Part 9.2 (Security)

**Important Reminders:**
- Rate limits must be tenant-aware for multi-tenancy
- Do not block legitimate high-traffic tenants with shared limits

**Phase:** Phase 1

---

## TASK T-RE-ENH-06 — Add Global Error Handler and Request Logging

**Title:** Implement Hono global error handler and structured JSON request logging middleware

**Objective:** Register `app.onError()` on the main Hono instance (worker.ts) to catch all unhandled exceptions and return a structured JSON error. Add request logging middleware that emits structured JSON for every request.

**Why It Matters:** Currently, uncaught exceptions return raw 500s that may expose internal details. In production, there is no way to diagnose failures, track error rates, or correlate requests.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** None (uses native Cloudflare Workers `crypto.randomUUID()`)

**Prerequisites:** None

**Impacted Modules:** `src/worker.ts`, create `src/middleware/logger.ts`, `src/middleware/errorHandler.ts`

**Likely Files to Change:**
- Create `src/middleware/logger.ts`
- Create `src/middleware/errorHandler.ts`
- `src/worker.ts` — register global middleware

**Expected Output:**
- `requestLogger` middleware: logs `{ requestId, method, path, status, duration_ms, tenant_id, environment }` as JSON to `console.log` (picked up by Cloudflare Logpush)
- `globalErrorHandler`: registered with `app.onError(err, c)`. Returns `{ success: false, error: { message, requestId, timestamp } }`. In development, includes stack trace. In production, stack trace omitted.
- `requestId` propagated via Hono context variable for correlation

**Acceptance Criteria:**
- All requests produce a JSON log line
- Uncaught errors return `{ success: false, error: { message, requestId } }`
- Stack traces only visible in `ENVIRONMENT=development`
- `requestId` present in both log and error response for correlation
- No sensitive data (JWT, payment keys) in logs

**Tests Required:**
- Handler that throws → 500 with structured JSON error body
- Request completes → log line contains method, path, status, duration
- Development environment → stack trace in response
- Production environment → no stack trace in response

**Risks:** Logging adds minor overhead. Use `waitUntil(ctx.waitUntil)` for async log shipping if needed.

**Governance Docs:** Cloudflare Workers observability patterns

**Phase:** Phase 1

---

## TASK T-RE-ENH-07 — Fix Agent Listing Ownership Enforcement

**Title:** Enforce agent-to-listing ownership check on PATCH /api/re/listings/:id

**Objective:** The `PATCH /api/re/listings/:id` route allows any `agent` role user to update any listing in the tenant. Fix this so agents can only update listings they are assigned to (via `re_agent_listings`). Admins retain unrestricted access.

**Why It Matters:** This is a security vulnerability. Any verified agent can modify competitor listings in the same tenant. This is a data integrity and trust issue.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** `re_agent_listings` table (already exists)

**Prerequisites:** None

**Impacted Modules:** `src/modules/listings/api/index.ts`

**Likely Files to Change:**
- `src/modules/listings/api/index.ts` — PATCH handler

**Expected Output:**
For `agent` role: query `re_agent_listings` to check `agent_id` matches user's agent record for the given `listing_id`. Return 403 if not assigned. For `admin`/`super_admin`: bypass ownership check.

**Acceptance Criteria:**
- Agent assigned to listing can PATCH it — 200
- Agent NOT assigned to listing → 403 with clear error
- Admin can PATCH any listing — 200
- Check uses `user_id` from JWT to find agent record, then checks assignment

**Tests Required:**
- Agent assigned to listing 1 can PATCH listing 1
- Agent assigned to listing 1 cannot PATCH listing 2 → 403
- Admin can PATCH any listing
- Agent with no agent profile → 403

**Risks:** Performance: adds one extra D1 query per agent PATCH. Acceptable given low frequency.

**Phase:** Phase 1

---

## TASK T-RE-ENH-08 — Implement Geolocation Search

**Title:** Add bounding box and proximity radius search to the listings GET endpoint

**Objective:** Extend `GET /api/re/listings` to accept `lat`, `lng`, `radius_km` query parameters and filter/sort results by proximity using the Haversine formula with a bounding box pre-filter.

**Why It Matters:** The `re_listings` table already stores `latitude` and `longitude`. Leading proptech platforms like PropertyPro and PrivateProperty offer map-based search. Without geo search, the lat/lng data is wasted.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** Existing `latitude`/`longitude` columns in `re_listings`

**Prerequisites:** None (columns already exist)

**Impacted Modules:** `src/modules/listings/api/index.ts`

**Likely Files to Change:**
- `src/modules/listings/api/index.ts` — Extend search handler with geo filtering

**Expected Output:**
When `lat`, `lng`, and `radius_km` are all provided:
1. Compute bounding box (lat ± delta, lng ± delta) using `radius_km`
2. Add `WHERE l.latitude BETWEEN ? AND ? AND l.longitude BETWEEN ? AND ?` clause
3. Add Haversine computed column in SELECT for ordering by distance
4. Return `distance_km` field in each result
5. Sort by `distance_km ASC` (override created_at ordering when geo search active)

**Acceptance Criteria:**
- Results filtered to within `radius_km` of (`lat`, `lng`)
- Results include `distance_km` field
- Results sorted by distance when geo params provided
- Invalid lat/lng → 400 with clear error
- Geo search composable with existing filters (type, price, bedrooms)
- Listings without coordinates are excluded from geo results

**Tests Required:**
- Listings within radius returned
- Listings outside radius excluded
- `distance_km` correct for known coordinates
- Combined with price filter works correctly
- Missing radius_km with lat/lng → 400

**Risks:** Haversine in SQLite is CPU-intensive for very large result sets. Use bounding box to pre-filter.

**Phase:** Phase 2

---

## TASK T-RE-ENH-09 — Add FTS5 Full-Text Search for Listings

**Title:** Implement D1 FTS5 virtual table for listing title/description/address search

**Objective:** Create a migration to add an FTS5 virtual table and triggers, then extend `GET /api/re/listings` to support a `q` query parameter for full-text search.

**Why It Matters:** Currently, title and description cannot be searched by keyword. Users looking for "3 bedroom duplex Lekki" cannot find matching listings without knowing the exact city/state. FTS5 is supported in Cloudflare D1.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** D1 FTS5 support (confirmed available in Cloudflare D1)

**Prerequisites:** None

**Impacted Modules:**
- New `migrations/003_fts5_listings.sql`
- `src/modules/listings/api/index.ts`

**Likely Files to Change:**
- Create `migrations/003_fts5_listings.sql`
- `src/modules/listings/api/index.ts` — extend search handler

**Expected Output:**
Migration creates:
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS re_listings_fts USING fts5(
  title, description, address, city, state, lga,
  content='re_listings', content_rowid='rowid'
);
```
Plus `AFTER INSERT`, `AFTER UPDATE`, `AFTER DELETE` triggers to keep FTS in sync.

When `q` param provided in GET /listings, join with FTS table using `re_listings_fts MATCH ?` and include `rank` in ordering.

**Acceptance Criteria:**
- `?q=3+bedroom+lekki` returns matching listings
- FTS table stays in sync with listing create/update/delete
- FTS search composable with other filters
- Graceful fallback if FTS table missing (returns unfiltered results with 200)
- Case-insensitive: lowercase queries match uppercase content

**Tests Required:**
- Create listing with title "3 Bedroom Duplex" → FTS search for "duplex" returns it
- Update listing title → FTS table updated
- Delete listing → FTS table updated
- FTS search combined with state filter

**Risks:** FTS5 tables cannot be exported from D1. Must document this limitation. Triggers add overhead on insert/update/delete.

**Phase:** Phase 2

---

## TASK T-RE-ENH-10 — Implement Cursor-Based Pagination

**Title:** Replace offset-based pagination with cursor-based pagination on all list endpoints

**Objective:** Replace `limit` + `offset` pagination with cursor-based pagination using `created_at` + `id` as the cursor on all list endpoints (listings, transactions, agents, inquiries).

**Why It Matters:** Offset pagination breaks on large, frequently-changing datasets (skipped or duplicated rows when new listings are added between pages). Cursor-based pagination is the industry standard for real estate APIs (RESO Web API, Airbnb, etc.).

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** Existing `created_at` and `id` columns

**Prerequisites:** None

**Impacted Modules:** All list endpoints in listings, transactions, agents, inquiries modules

**Likely Files to Change:**
- `src/modules/listings/api/index.ts`
- `src/modules/transactions/api/index.ts`
- `src/modules/agents/api/index.ts`
- `src/modules/inquiries/api/index.ts` (new)

**Expected Output:**
- Endpoints accept optional `cursor` query param (opaque base64-encoded `{created_at}:{id}`)
- Response includes `meta.next_cursor` (null if no more results)
- No `offset` parameter (deprecated; accept but warn)
- Query uses `WHERE (created_at, id) < (cursor_ts, cursor_id) ORDER BY created_at DESC, id DESC LIMIT ?`

**Acceptance Criteria:**
- First page returns `meta.next_cursor`
- Subsequent page with `cursor` returns correct next page
- Last page returns `meta.next_cursor = null`
- No duplicates or skips when new listings added between pages
- Old `offset` param still accepted (returns deprecation warning in response)

**Tests Required:**
- First page correct
- Second page using cursor correct
- No duplicates across two pages
- cursor=null returns first page
- Invalid cursor → 400

**Phase:** Phase 2

---

## TASK T-RE-ENH-11 — Add R2 Signed URL Endpoint for Agent Documents

**Title:** Implement secure time-limited URL generation for agent ESVARBON documents stored in R2

**Objective:** Add `GET /api/re/agents/:id/documents/url` which generates a time-limited presigned URL for the agent's `esvarbon_doc_key` in R2, allowing admins to view uploaded certificates without making documents publicly accessible.

**Why It Matters:** Agent ESVARBON certificates are stored in R2 but there is no way to retrieve them. Admins performing manual review have no way to view the uploaded documents.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** Cloudflare R2 presigned URL API, `DOCUMENTS` R2 binding

**Prerequisites:** Agent must have `esvarbon_doc_key` set (document must be uploaded first)

**Impacted Modules:** `src/modules/agents/api/index.ts`

**Likely Files to Change:**
- `src/modules/agents/api/index.ts` — Add new route handler

**Expected Output:**
`GET /api/re/agents/:id/documents/url` (admin only):
- Checks agent has `esvarbon_doc_key`
- Generates a presigned URL using `DOCUMENTS.createPresignedUrl(key, { expiresIn: 3600 })`
- Returns `{ url, expires_in: 3600, key }`

**Acceptance Criteria:**
- Returns presigned URL for existing document
- URL expires in 1 hour
- Returns 404 if agent has no document uploaded
- Admin-only access (403 for non-admin)
- URL is HTTPS and cannot be guessed

**Tests Required:**
- Agent with document → returns presigned URL
- Agent without document → 404
- Non-admin role → 403
- Mock R2.createPresignedUrl called with correct key and expiry

**Risks:** Cloudflare R2 presigned URL availability and syntax may differ from S3 — verify against current CF docs.

**Phase:** Phase 2

---

## TASK T-RE-ENH-12 — Build Agent Verification Audit Log

**Title:** Create append-only agent verification state transition log

**Objective:** Add a new migration creating `re_agent_verification_log` table. Record every verification state transition (who triggered it, from what state, to what state, and when). Populated by the verify/approve/reject endpoints.

**Why It Matters:** Currently, verification decisions are overwritten (only the current state is retained). There is no way to see the history of an agent's verification journey. This is a compliance gap (NDPA 2023 requires audit trails for sensitive data processing).

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** `re_agents` table (already exists)

**Prerequisites:** None

**Impacted Modules:** New `migrations/004_verification_audit_log.sql`, `src/modules/agents/api/index.ts`

**Likely Files to Change:**
- Create `migrations/004_verification_audit_log.sql`
- `src/modules/agents/api/index.ts` — Insert audit log entry in verify/approve/reject handlers
- Add `GET /api/re/agents/:id/verification/history` endpoint (admin only)

**Expected Output:**
```sql
CREATE TABLE IF NOT EXISTS re_agent_verification_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES re_agents(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  action TEXT NOT NULL, -- 'api_verify', 'manual_approve', 'manual_reject', 'doc_upload'
  triggered_by TEXT,    -- user_id of admin or 'system' for API calls
  reason TEXT,
  created_at INTEGER NOT NULL
);
```

**Acceptance Criteria:**
- Every state transition creates an audit log entry
- Log entries are never deleted or updated (append-only)
- `GET /api/re/agents/:id/verification/history` returns full log in chronological order
- `triggered_by` correctly identifies admin or system
- tenant_id enforced

**Tests Required:**
- Verify agent → log entry created with correct from/to status
- Manual approve → log entry created
- Reject → log entry created
- History endpoint returns all entries in order
- No route allows deleting log entries

**Phase:** Phase 2

---

## TASK T-RE-ENH-13 — Implement Inter-Service Event Emission

**Title:** Emit domain events after key lifecycle transitions using outbound fetch or KV signaling

**Objective:** After `transaction.completed`, `agent.verified`, and `inquiry.submitted` events, emit structured domain events to the WebWaka event bus (via `INTER_SERVICE_SECRET`-authenticated outbound fetch to `CENTRAL_MGMT_URL`) or to a KV-based event queue for consumption by other repos.

**Why It Matters:** The WebWaka platform is event-driven. Currently, when a transaction completes or an agent is verified, no other service knows. The notifications service, analytics service, and fintech payout service all need these events.

**Repo Scope:** `webwaka-real-estate` (emission only — consumption is in other repos)

**Dependencies:** `INTER_SERVICE_SECRET`, `CENTRAL_MGMT_URL` env vars (already in wrangler.toml)

**Prerequisites:** Understand the WebWaka event bus contract (check other repos for event shape)

**Impacted Modules:** `src/modules/transactions/api/index.ts`, `src/modules/agents/api/index.ts`, `src/modules/inquiries/api/index.ts`

**Likely Files to Change:**
- Create `src/services/eventEmitter.ts` — shared event emission helper
- `src/modules/transactions/api/index.ts` — emit on status → completed
- `src/modules/agents/api/index.ts` — emit on verification status → verified/rejected
- `src/modules/inquiries/api/index.ts` — emit on inquiry created

**Expected Output:**
`eventEmitter.emit(event, payload, env)`:
- If `CENTRAL_MGMT_URL` is set: POST to `{CENTRAL_MGMT_URL}/events` with `Authorization: Bearer {INTER_SERVICE_SECRET}`
- Payload: `{ event, source: 'webwaka-real-estate', tenant_id, timestamp, data }`
- Use `ctx.waitUntil()` so event emission doesn't block the response
- If `CENTRAL_MGMT_URL` not set: log event as JSON (development mode)

Events:
- `real_estate.transaction.completed` — `{ transaction_id, listing_id, total_kobo, buyer_id }`
- `real_estate.agent.verified` — `{ agent_id, method, esvarbon_reg_no }`
- `real_estate.inquiry.submitted` — `{ inquiry_id, listing_id, inquirer_phone }`

**Acceptance Criteria:**
- Events emitted via `ctx.waitUntil()` (non-blocking)
- Event emission failure does not fail the API response
- Correct event shape with all required fields
- `INTER_SERVICE_SECRET` never logged or exposed
- Graceful no-op when `CENTRAL_MGMT_URL` not configured

**Tests Required:**
- Transaction completes → event emitter called with correct payload
- Emission failure → response still succeeds (non-blocking)
- Development mode → event logged as JSON

**Phase:** Phase 2

---

## TASK T-RE-ENH-14 — Add Shortlet Calendar Availability API

**Title:** Implement block-out dates and availability check for shortlet listings

**Objective:** Add calendar availability management for `listing_type = 'shortlet'`. Allow agents to block dates, and provide a public endpoint to check availability for a date range.

**Why It Matters:** Shortlet is listed as a supported `listing_type` in the schema. Without an availability/calendar API, it is functionally unusable. The Nigerian vacation/shortlet market is growing rapidly (Airbnb, Booking.com alternatives).

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** None (new schema)

**Prerequisites:** None

**Impacted Modules:** New `migrations/005_shortlet_calendar.sql`, new `src/modules/shortlet/api/index.ts`, update `src/worker.ts`

**Likely Files to Change:**
- Create `migrations/005_shortlet_calendar.sql`
- Create `src/modules/shortlet/api/index.ts`
- Update `src/worker.ts` to route `/api/re/shortlet/*`

**Expected Output:**
```sql
CREATE TABLE IF NOT EXISTS re_shortlet_availability (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  listing_id TEXT NOT NULL REFERENCES re_listings(id) ON DELETE CASCADE,
  blocked_date TEXT NOT NULL,  -- ISO date string YYYY-MM-DD
  reason TEXT,  -- 'booked', 'maintenance', 'owner_use', etc.
  created_at INTEGER NOT NULL,
  UNIQUE(tenant_id, listing_id, blocked_date)
);
```

Routes:
- `GET /api/re/shortlet/:listingId/availability?from=YYYY-MM-DD&to=YYYY-MM-DD` — Public. Returns list of blocked dates in range.
- `POST /api/re/shortlet/:listingId/availability` — Admin/agent. Block one or more dates.
- `DELETE /api/re/shortlet/:listingId/availability/:date` — Admin/agent. Unblock a date.

**Acceptance Criteria:**
- Availability check returns array of `{ date, available: boolean }` for each day in range
- Block endpoint accepts array of dates or a date range
- Only shortlet listings can have availability managed
- tenant_id enforced

**Tests Required:**
- Check availability for unblocked range → all available
- Block a date → that date shows as unavailable
- Unblock a date → shows as available again
- Non-shortlet listing → 400

**Phase:** Phase 3

---

## TASK T-RE-ENH-15 — Implement NDPA Consent Tracking for Inquiries

**Title:** Add NDPA 2023 consent field to inquiry submission and consent management API

**Objective:** Add `consent_given` (boolean) and `consent_version` (string) fields to inquiry submissions. Reject submissions without explicit consent. Add a migration to extend `re_inquiries` schema.

**Why It Matters:** Nigeria's NDPA 2023 (effective September 2025 with GAID) requires explicit, documented consent before processing buyer PII (name, phone, email). Inquiry submissions collect this PII. Non-compliance risks regulatory action from NDPC.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** NDPA 2023 regulatory requirement

**Prerequisites:** T-RE-ENH-02 (Inquiries API) must be implemented first

**Impacted Modules:** `src/modules/inquiries/api/index.ts`, new migration

**Likely Files to Change:**
- Create `migrations/006_inquiry_consent.sql`
- `src/modules/inquiries/api/index.ts` — enforce consent

**Expected Output:**
Migration adds to `re_inquiries`: `consent_given INTEGER NOT NULL DEFAULT 0`, `consent_version TEXT`, `consent_timestamp INTEGER`

POST /inquiries:
- Requires `consent_given: true` in request body
- Requires `consent_version` (e.g., `"NDPA-2023-v1"`)
- Returns 400 if `consent_given !== true`
- Stores `consent_timestamp = Date.now()`

**Acceptance Criteria:**
- POST without `consent_given: true` → 400 with NDPA reference in error message
- POST with consent → 201 with consent fields stored
- `consent_version` stored immutably with record
- No PII processing without consent

**Tests Required:**
- POST without consent → 400
- POST with consent=false → 400
- POST with consent=true and version → 201, consent fields stored
- Verify consent_timestamp is set

**Phase:** Phase 2

---

## TASK T-RE-ENH-16 — Replace Math.random() ID Generation with crypto.randomUUID()

**Title:** Replace Math.random()-based ID generation with crypto.randomUUID() across all modules

**Objective:** Replace `${Date.now()}_${Math.random().toString(36).slice(2, 9)}` with `crypto.randomUUID()` as the ID generation strategy in all insert handlers. crypto.randomUUID() is available natively in Cloudflare Workers.

**Why It Matters:** Math.random() is not cryptographically secure and has a small but non-zero collision probability, especially in high-throughput multi-tenant scenarios. UUID v4 (128-bit) has negligible collision probability.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** `crypto.randomUUID()` (available in all Cloudflare Workers runtimes)

**Prerequisites:** None

**Impacted Modules:** All modules with INSERT handlers (listings, transactions, agents, payments, inquiries)

**Likely Files to Change:**
- `src/modules/listings/api/index.ts`
- `src/modules/transactions/api/index.ts`
- `src/modules/agents/api/index.ts`

**Expected Output:**
Replace all occurrences of:
```typescript
const id = `re_lst_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
```
With:
```typescript
const id = crypto.randomUUID();
```
Update all modules. Update corresponding tests to handle UUID format.

**Acceptance Criteria:**
- All IDs are valid UUID v4 format
- No Math.random() calls remain in ID generation
- Tests pass with UUID IDs
- ID format documented in schema comments

**Tests Required:**
- Created entity has UUID-format ID
- Regex verify format: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`

**Phase:** Phase 1

---

## TASK T-RE-ENH-17 — Add Market Analytics Endpoints

**Title:** Implement real estate market analytics API (price trends, listing counts, average prices)

**Objective:** Add `GET /api/re/analytics/market` endpoint providing aggregate data: average price by state, listing count by type, price-per-sqm averages, and listing trends over time.

**Why It Matters:** Market analytics is a key differentiator for real estate platforms. PropertyPro, PrivateProperty, and international platforms like Zillow all provide market data. This enables tenants to offer value-added insights to their customers.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** Existing `re_listings` data

**Prerequisites:** None

**Impacted Modules:** New `src/modules/analytics/api/index.ts`, update `src/worker.ts`

**Likely Files to Change:**
- Create `src/modules/analytics/api/index.ts`
- Update `src/worker.ts`

**Expected Output:**
`GET /api/re/analytics/market`:
- Required: `tenant_id` (from JWT or query param)
- Optional: `state`, `listing_type`, `property_type`
- Returns:
  - `total_listings: number`
  - `avg_price_kobo: number` (per listing type)
  - `avg_price_per_sqm_kobo: number` (where size_sqm > 0)
  - `listings_by_state: [{state, count, avg_price_kobo}]`
  - `listings_by_type: [{listing_type, count}]`
  - `price_distribution: [{range, count}]`

**Acceptance Criteria:**
- Returns correct aggregates for tenant's listings
- Handles zero-data case gracefully
- Price-per-sqm excludes listings with null/zero size_sqm
- tenant_id enforced (admin/agent roles only)
- Response cached in KV for 5 minutes to reduce D1 load

**Tests Required:**
- Zero listings → empty aggregates returned
- Mix of listing types → correct counts per type
- price_per_sqm excludes null sizes
- Cached response returned on second call within TTL

**Phase:** Phase 3

---

## TASK T-RE-ENH-18 — Add ESLint Configuration

**Title:** Add ESLint configuration with TypeScript rules for code quality enforcement

**Objective:** Create `eslint.config.js` (flat config format for ESLint v9+) with `@typescript-eslint/recommended` rules, Cloudflare Workers environment, and `no-console` warning (structured logging preferred). Add `npm run lint` script.

**Why It Matters:** No ESLint configuration exists. The CI workflow references `npm run lint` which would fail if `|| true` was removed. Code quality is unenforceable.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `globals`

**Prerequisites:** Install ESLint packages

**Impacted Modules:** New `eslint.config.js`, `package.json`

**Likely Files to Change:**
- Create `eslint.config.js`
- `package.json` — add lint script and devDependencies

**Expected Output:**
```javascript
// eslint.config.js
import tseslint from 'typescript-eslint';
export default tseslint.config(
  tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-explicit-any': 'warn', 'no-console': 'off' } }
);
```

**Acceptance Criteria:**
- `npm run lint` runs without errors on clean codebase
- Existing `(c as any)` casts flagged as warnings
- CI runs lint step without `|| true`

**Phase:** Phase 1

---

## TASK T-RE-ENH-19 — Add Comprehensive Tests for Listings and Transactions Modules

**Title:** Write test suites for listings and transactions modules matching the quality of agent tests

**Objective:** Create `src/modules/listings/api/index.test.ts` and `src/modules/transactions/api/index.test.ts` with comprehensive test coverage including happy paths, validation errors, auth gates, and monetary integrity checks.

**Why It Matters:** The listings and transactions modules have ZERO test coverage. These are the highest-traffic, highest-risk modules in the platform. The agent module's 27-test suite demonstrates the expected quality bar.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** Vitest, same mock patterns as agent tests

**Prerequisites:** None

**Impacted Modules:** New test files

**Likely Files to Change:**
- Create `src/modules/listings/api/index.test.ts`
- Create `src/modules/transactions/api/index.test.ts`

**Expected Output:**
Listings tests:
- GET /listings public search (filter by type, price, state, verified_only)
- GET /listings/:id returns listing detail with agents and images
- POST /listings creates listing (verified agent allowed)
- POST /listings blocked for unverified agent (403)
- POST /listings validates price_kobo is positive integer
- PATCH /listings/:id updates allowed fields
- PATCH /listings/:id validates monetary fields
- DELETE /listings/:id soft-deletes (admin only)
- POST /listings/:id/images uploads to R2
- DELETE /listings/:id/images/:imageId removes from R2 and DB

Transactions tests:
- POST /transactions creates transaction with correct total_payable_kobo
- POST /transactions validates agreed_price_kobo > 0
- POST /transactions fails if listing not found
- GET /transactions lists with filters
- PATCH /transactions/:id/status updates to valid status
- PATCH /transactions/:id/status rejects invalid status
- POST /webhooks/paystack verifies HMAC signature
- POST /webhooks/paystack processes charge.success idempotently
- POST /webhooks/paystack ignores events without metadata
- POST /webhooks/paystack rejects invalid signature (401)

**Acceptance Criteria:**
- Min 20 test cases for listings, 15 for transactions
- Test patterns match agent test style (mocked D1, R2, KV)
- All tests pass with `npm test`
- Coverage includes error paths

**Phase:** Phase 1

---

## TASK T-RE-ENH-20 — Paystack Subscription for Recurring Rent Payments

**Title:** Implement Paystack Subscription plan creation and management for rental transactions

**Objective:** Add endpoints to create Paystack subscription plans for rental transactions, enabling automated monthly rent collection without agent intervention.

**Why It Matters:** Manual monthly rent collection via one-time Paystack links is operationally expensive. Paystack Subscriptions automate this. The Nigerian rental market (long-term rent, not shortlet) represents the majority of transactions on most platforms.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** Paystack Subscriptions API, `PAYSTACK_SECRET_KEY`

**Prerequisites:** T-RE-ENH-03 (Paystack charge initiation) should be implemented first

**Impacted Modules:** `src/modules/transactions/api/index.ts`, new migration for subscription tracking

**Likely Files to Change:**
- Create `migrations/007_paystack_subscriptions.sql`
- `src/modules/transactions/api/index.ts` — add subscription endpoints

**Expected Output:**
- `POST /api/re/transactions/:id/subscribe` — Creates a Paystack plan and customer, initializes a subscription. Stores plan_code and subscription_code in new `re_subscriptions` table.
- `DELETE /api/re/transactions/:id/subscribe` — Cancels the subscription via Paystack API.
- Webhook handler extended to process `invoice.payment_failed`, `subscription.not_renew` events.

**Acceptance Criteria:**
- Subscription created for `rent` transaction type only (not `sale`)
- Plan interval matches rental period (monthly)
- Plan amount matches `total_payable_kobo` / rental_months
- Webhook processes subscription payment events correctly
- Subscription cancellation updates transaction status

**Tests Required:**
- Create subscription for rent transaction → plan_code stored
- Create subscription for sale transaction → 400
- Webhook `invoice.payment_failed` → payment_status updated

**Phase:** Phase 3

---

## TASK T-RE-ENH-21 — Add wrangler.toml Migrations Directory Configuration

**Title:** Configure migrations_dir in wrangler.toml and fix D1 migration workflow

**Objective:** Add `migrations_dir = "migrations"` to wrangler.toml for all environments. Verify that `wrangler d1 migrations apply` works correctly for local dev, staging, and production.

**Why It Matters:** Without `migrations_dir` configured, developers must use `--file` flags manually. The CI/CD workflow uses `d1 migrations apply` which may not resolve migration files correctly.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** None

**Prerequisites:** None

**Impacted Modules:** `wrangler.toml`, `README.md`

**Likely Files to Change:**
- `wrangler.toml`
- `README.md`

**Expected Output:**
Add to wrangler.toml:
```toml
[[ d1_databases]]
binding = "DB"
database_name = "webwaka-real-estate-local"
database_id = "local"
migrations_dir = "migrations"
```

Update README with correct migration commands.

**Acceptance Criteria:**
- `wrangler d1 migrations apply webwaka-real-estate-local --local` applies all migrations correctly
- CI migration step works without `--file` flags
- Local dev setup documented in README

**Phase:** Phase 1

---

## TASK T-RE-ENH-22 — Add Vitest Configuration for Cloudflare Workers Environment

**Title:** Add vitest.config.ts with Cloudflare Workers pool configuration

**Objective:** Create `vitest.config.ts` using `@cloudflare/vitest-pool-workers` for more realistic test execution within the Cloudflare Workers environment, reducing the need for manual binding mocks.

**Why It Matters:** Current tests use fragile manual mocks for D1, R2, and KV. The `@cloudflare/vitest-pool-workers` package provides real miniflare bindings in tests, making them more reliable and closer to production behavior.

**Repo Scope:** `webwaka-real-estate` only

**Dependencies:** `@cloudflare/vitest-pool-workers`, `miniflare`

**Prerequisites:** None

**Impacted Modules:** New `vitest.config.ts`, update existing test files

**Likely Files to Change:**
- Create `vitest.config.ts`
- Update `package.json` devDependencies

**Expected Output:**
```typescript
// vitest.config.ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
export default defineWorkersConfig({
  test: { poolOptions: { workers: { wrangler: { configPath: './wrangler.toml' } } } },
});
```

**Acceptance Criteria:**
- All 27 existing tests pass with new config
- Tests use real D1 bindings (miniflare) instead of manual mocks
- Test execution time acceptable (< 30 seconds for full suite)

**Phase:** Phase 3

---

# SECTION 7 — QA PLANS

---

## QA Plan for T-RE-ENH-01 (Listing Image Upload/Delete)

**What Must Be Verified:**
- POST /listings/:id/images accepts JPEG, PNG, WEBP files
- POST rejects PDF, GIF, BMP (400)
- POST rejects files > 10MB (400)
- POST inserts row in `re_listing_images` with correct `r2_key`, `listing_id`, `tenant_id`
- First uploaded image has `is_primary = 1`
- Subsequent images have `is_primary = 0`
- DELETE removes R2 object and DB row
- DELETE of primary image promotes next image (by sort_order) to primary
- DELETE of last image leaves no primary image
- Tenant isolation: cannot delete another tenant's image

**Bugs to Look For:**
- R2 put called with wrong content-type header
- is_primary not set correctly on first upload
- Primary promotion query incorrect (doesn't handle empty case)
- tenant_id not scoped in DB queries
- Missing R2 delete on image removal (DB row deleted but R2 object left behind)

**Edge Cases:**
- Upload to non-existent listing
- Delete non-existent image
- Concurrent uploads (both try to set is_primary)
- Listing with zero images after delete

**Regressions to Detect:**
- Existing listing CRUD routes still work
- Agent verification gate on listing creation still works

**What Done Means for QA:**
All tests pass. R2.put and R2.delete called correctly in all scenarios. DB rows consistent with R2 state. Tenant isolation verified.

---

## QA Plan for T-RE-ENH-02 (Inquiries API)

**What Must Be Verified:**
- POST /inquiries creates inquiry for active listing
- POST fails for inactive/non-existent listing
- POST requires name and phone; email optional
- GET /inquiries returns tenant-scoped results
- GET supports status and listing_id filters
- PATCH /inquiries/:id/status valid transitions work
- PATCH invalid status returns 400
- Public POST does not require JWT
- GET/PATCH require agent or admin role

**Bugs to Look For:**
- PII accessible to wrong tenant
- Inquiry created for listing in different tenant
- Status transition not validated (any string accepted)
- Missing tenant_id scope in list query

**Edge Cases:**
- Inquiry submission with special characters in name/phone
- Empty message field (should be optional)
- Very long message (text field limits)
- Multiple inquiries for same listing from same person

**NDPA Compliance Check:**
- Consent field enforced after T-RE-ENH-15
- PII not exposed in listing-level responses

---

## QA Plan for T-RE-ENH-03 (Paystack Charge Initiation)

**What Must Be Verified:**
- POST /transactions/:id/pay calls Paystack initialize with correct amount (kobo)
- metadata includes tenant_id and transaction_id
- Response contains authorization_url, access_code, reference
- Already-paid transaction returns 400
- Missing PAYSTACK_SECRET_KEY returns appropriate error
- Paystack API failure returns 503

**Bugs to Look For:**
- Amount sent to Paystack is float (must be integer kobo)
- metadata.tenant_id missing or wrong
- Paystack API key exposed in response or logs
- transaction_id not included in metadata

**Cross-Repo Assumptions:**
- Paystack webhook receiver (same repo) expects metadata.tenant_id and metadata.transaction_id — verify they match exactly
- Frontend repo expects authorization_url format — document the response shape

---

## QA Plan for T-RE-ENH-04 (CI/CD Fix)

**What Must Be Verified:**
- Introducing a TypeScript error causes CI to fail on lint-and-test job
- Introducing a test failure causes CI to fail
- Introducing a lint violation causes CI to fail
- Clean codebase passes all CI checks
- PR cannot merge with failing CI

**Bugs to Look For:**
- Any remaining `|| true` in quality gate steps
- lint script missing from package.json
- ESLint config not detecting all .ts files

**Regression:**
- Existing 27 tests still pass
- TypeScript strict mode still compiles cleanly

---

## QA Plan for T-RE-ENH-05 (Rate Limiting)

**What Must Be Verified:**
- First N requests to search endpoint pass (within limit)
- Request N+1 returns 429 with Retry-After header
- Counter resets after TTL
- Different tenants have independent counters
- Different routes have independent counters
- Authenticated endpoints use tenant_id in key
- Public endpoints use IP in key

**Bugs to Look For:**
- Race condition (two concurrent requests both pass when only 1 should)
- KV TTL not set correctly (counter persists forever)
- Rate limit applies globally instead of per-route
- Retry-After value incorrect

**Edge Cases:**
- KV unavailable (should fail open — allow request through, not block)
- Large burst then pause then burst (sliding window correct?)

---

## QA Plan for T-RE-ENH-06 (Error Handler + Logging)

**What Must Be Verified:**
- Intentionally thrown error returns `{ success: false, error: { message, requestId } }`
- requestId present in both log output and response body
- Stack trace appears in development but not production
- All requests produce a JSON log line with method, path, status, duration
- No JWT or payment keys appear in logs

**Bugs to Look For:**
- Error handler not catching all exception types
- requestId not set before error occurs
- Duration calculation wrong (start not captured before awaiting)
- Sensitive data (JWT token value) appearing in logs

---

## QA Plan for T-RE-ENH-07 (Agent Ownership Check)

**What Must Be Verified:**
- Agent assigned to listing 1 can PATCH listing 1
- Agent assigned to listing 1 CANNOT PATCH listing 2 → 403
- Admin can PATCH any listing
- User with agent role but no agent profile in DB → 403

**Regression Bugs:**
- Admin access accidentally restricted
- Agent can no longer update their own listings

---

## QA Plan for T-RE-ENH-08 (Geolocation Search)

**What Must Be Verified:**
- Results within radius returned; results outside excluded
- distance_km field correct for known coordinates
- Listing without lat/lng excluded from geo results
- Combined with other filters (type, price) works
- Invalid lat/lng values → 400

**Test Coordinates:**
- Use Lagos (6.5244°N, 3.3792°E) and Abuja (9.0579°N, 7.4951°E) as known test pairs (~500km apart)

---

## QA Plan for T-RE-ENH-09 (FTS5 Search)

**What Must Be Verified:**
- Keyword search returns matching listings
- Case-insensitive search works
- FTS index updated after listing create/update/delete
- FTS search combined with state/type filters works
- Empty search (q not provided) falls back to normal search

**Bugs to Look For:**
- Trigger not firing on update
- Case sensitivity issues (FTS5 on D1 case-sensitive — must lowercase query)
- Listing deleted from main table but FTS index not updated (orphaned FTS row)

---

## QA Plan for T-RE-ENH-10 (Cursor Pagination)

**What Must Be Verified:**
- First page returns correct results and next_cursor
- Second page using cursor returns correct next page
- No duplicates or skips between pages
- Last page has next_cursor = null
- Invalid cursor returns 400
- Old offset param accepted with deprecation warning

**Edge Cases:**
- Single result spanning exactly one page
- Empty result set → next_cursor = null, empty results
- New listing added between page 1 and page 2 requests (must not duplicate)

---

## QA Plan for T-RE-ENH-11 (R2 Signed URLs)

**What Must Be Verified:**
- Returns presigned URL for agent with uploaded document
- URL is HTTPS
- Returns 404 for agent without document
- Returns 403 for non-admin caller
- Expiry is correctly set (1 hour)

---

## QA Plan for T-RE-ENH-12 (Verification Audit Log)

**What Must Be Verified:**
- Every state transition (verify, approve, reject, doc_upload) creates a log entry
- Log entries are never modified or deleted (no UPDATE/DELETE routes)
- History endpoint returns entries in chronological order
- triggered_by correctly identifies admin user or 'system'
- tenant_id enforced on all log queries

---

## QA Plan for T-RE-ENH-13 (Event Emission)

**What Must Be Verified:**
- transaction.completed event emitted after status change to 'completed'
- agent.verified event emitted after verification approval
- inquiry.submitted event emitted after inquiry creation
- Event payload includes tenant_id, timestamp, and domain-specific fields
- Event emission failure does not fail the API response
- INTER_SERVICE_SECRET not exposed in event payload or logs
- Development mode: events logged as JSON (no outbound fetch)

---

## QA Plan for T-RE-ENH-14 (Shortlet Calendar)

**What Must Be Verified:**
- Block a date → date shows as unavailable in availability check
- Unblock a date → date shows as available
- Availability range check returns correct boolean per day
- Cannot add calendar to non-shortlet listing → 400
- Overlapping blocks handled correctly (UNIQUE constraint)

---

## QA Plan for T-RE-ENH-15 (NDPA Consent)

**What Must Be Verified:**
- POST /inquiries without consent_given → 400
- POST with consent_given = false → 400
- POST with consent_given = true and consent_version → 201
- consent_timestamp stored correctly
- NDPA error messages reference consent requirement clearly

---

## QA Plan for T-RE-ENH-16 (UUID IDs)

**What Must Be Verified:**
- Created listing ID matches UUID v4 regex
- Created agent ID matches UUID v4 regex
- Created transaction ID matches UUID v4 regex
- No `Math.random()` calls remain in ID generation code
- All existing tests still pass with UUID format IDs

---

## QA Plan for T-RE-ENH-17 (Market Analytics)

**What Must Be Verified:**
- Returns correct total_listings count for tenant
- avg_price_kobo correct for filtered listing_type
- Price-per-sqm excludes listings with null/zero size_sqm
- KV cache returns same result within TTL
- Tenant isolation: tenant A cannot see tenant B's analytics
- Empty dataset returns zeros, not errors

---

## QA Plan for T-RE-ENH-18 (ESLint)

**What Must Be Verified:**
- `npm run lint` exits 0 on clean codebase
- `npm run lint` exits non-zero on introduced violation
- All `.ts` files in `src/` are included
- `eslint.config.js` correctly references TypeScript parser

---

## QA Plan for T-RE-ENH-19 (Listings + Transactions Tests)

**What Must Be Verified:**
- All new tests pass (`npm test`)
- Coverage includes happy paths, error paths, auth gates
- Monetary integrity tests (float passed → 400)
- HMAC signature tests for Paystack webhook
- Tests follow same mock pattern as agent tests (no real network calls)

---

## QA Plan for T-RE-ENH-20 (Paystack Subscriptions)

**What Must Be Verified:**
- Subscription created for rent transaction only
- Attempt to subscribe sale transaction → 400
- Plan amount = agreed_price_kobo / rental_period_months
- Webhook invoice.payment_failed → payment status updated
- Subscription cancellation → transaction status updated

---

## QA Plan for T-RE-ENH-21 (Migrations Config)

**What Must Be Verified:**
- `wrangler d1 migrations apply webwaka-real-estate-local --local` applies migrations in order
- No `--file` flags needed
- CI migration steps succeed without manual intervention
- README reflects correct commands

---

## QA Plan for T-RE-ENH-22 (Vitest Config)

**What Must Be Verified:**
- All 27 existing tests pass with new config
- Test execution uses Cloudflare Workers pool
- Real D1 bindings used in tests (not manual mocks)
- No test regressions

---

# SECTION 8 — IMPLEMENTATION PROMPTS

---

## PROMPT: T-RE-ENH-01 Implementation

```markdown
You are a Replit execution agent implementing a feature in the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-01
**Task Title:** Implement Listing Image Upload and Delete Routes

**Repo Context:**
`webwaka-real-estate` is a Cloudflare Workers API (Hono framework) for Nigerian real estate.
It is NOT standalone — it is one component of the WebWaka OS v4 multi-repo platform.
Auth is provided by `@webwaka/core` (`jwtAuthMiddleware`, `requireRole`, `getTenantId`).
All monetary values are stored as integer kobo. R2 stores property images and documents.

**Objective:**
Implement the two route handlers that are documented in `src/modules/listings/api/index.ts` but not yet implemented:
1. `POST /api/re/listings/:id/images` — Upload a property image to R2 and record it in `re_listing_images`
2. `DELETE /api/re/listings/:id/images/:imageId` — Remove image from R2 and `re_listing_images`

**Dependencies:**
- `DOCUMENTS` R2 binding (already configured in wrangler.toml)
- `re_listing_images` table (already created in migration 001)
- `@webwaka/core` for auth

**Before Acting:**
1. Read `src/modules/listings/api/index.ts` fully
2. Read `migrations/001_real_estate_schema.sql` to understand the `re_listing_images` schema
3. Read `src/modules/agents/api/index.ts` to understand the R2 upload pattern (document upload uses the same pattern)
4. Read `wrangler.toml` to understand binding names

**Required Deliverables:**
- `POST /api/re/listings/:id/images`: multipart/form-data with `image` file field. Allowed types: JPEG, PNG, WEBP. Max 10MB. R2 key: `listings/{tenantId}/{listingId}/img_{timestamp}.{ext}`. DB insert into `re_listing_images`. If no existing primary image, set `is_primary = 1`.
- `DELETE /api/re/listings/:id/images/:imageId`: fetch `r2_key` from DB, delete from R2 (`DOCUMENTS.delete(key)`), delete DB row. If deleted image was `is_primary`, promote next image by `sort_order ASC` to primary.
- Add corresponding tests to a new `src/modules/listings/api/images.test.ts` or append to existing listings test file

**Acceptance Criteria:**
- POST returns 201 `{ success: true, data: { image_id, r2_key, is_primary, sort_order } }`
- DELETE returns 200 `{ success: true }`
- Wrong file type → 400
- File too large → 400
- Listing not found → 404
- Image not found → 404
- tenant_id enforced on all DB queries

**Important Reminders:**
- Use `crypto.randomUUID()` for image IDs (not Math.random())
- This repo is backend-only — the frontend consuming these routes is in a separate repo
- Do not break existing listing routes
- Do not expose R2 keys in list responses (use image ID for deletion)
- Consult Blueprint Part 9.2 for multi-tenancy patterns

**Ecosystem Caveat:**
This repo does NOT contain the frontend. The frontend repo will consume these endpoints. Do not build a frontend component. Do not change `wrangler.toml` deployment configs.

**Do Not:**
- Skip error handling
- Use Math.random() for IDs
- Leave R2 objects orphaned if DB insert fails
- Add `|| true` to any test or build commands
```

---

## PROMPT: T-RE-ENH-02 Implementation

```markdown
You are a Replit execution agent implementing a feature in the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-02
**Task Title:** Build Complete Inquiries API

**Repo Context:**
`webwaka-real-estate` is a Cloudflare Workers API (Hono framework) for Nigerian real estate. Part of WebWaka OS v4 multi-repo platform. Auth from `@webwaka/core`. All tenant_id scoping mandatory. NDPA 2023 compliance required for PII handling.

**Objective:**
Build a complete CRUD API for property inquiries. The `re_inquiries` table was created in migration 001 but has no API routes. Implement the inquiries module at `/api/re/inquiries`.

**Dependencies:**
- `re_inquiries` schema (migration 001) — already exists
- `@webwaka/core` for auth
- `src/worker.ts` for routing

**Before Acting:**
1. Read `migrations/001_real_estate_schema.sql` — understand `re_inquiries` schema
2. Read `src/modules/agents/api/index.ts` — copy module structure pattern
3. Read `src/worker.ts` — understand how to add new routing

**Required Deliverables:**
- `src/modules/inquiries/api/index.ts` — Full Hono app with routes:
  - `POST /api/re/inquiries` — Public (no JWT). Requires: `listing_id`, `inquirer_name`, `inquirer_phone`. Optional: `inquirer_email`, `message`. Validates listing exists and is active.
  - `GET /api/re/inquiries` — Admin/agent. List with filters: `listing_id`, `status`. Cursor-based pagination (or offset for now).
  - `GET /api/re/inquiries/:id` — Admin/agent. Detail view.
  - `PATCH /api/re/inquiries/:id/status` — Admin/agent. Valid statuses: `new`, `contacted`, `viewing_scheduled`, `closed`.
- `src/modules/inquiries/api/index.test.ts` — Minimum 8 test cases
- Update `src/worker.ts` to route `/api/re/inquiries/*`

**Acceptance Criteria:**
- POST without JWT succeeds for valid listing
- POST missing required fields → 400
- GET requires admin or agent role
- PATCH invalid status → 400 with valid statuses listed
- tenant_id enforced throughout

**Important Reminders:**
- Public POST: include `consent_given` field (boolean) — reject if false (NDPA 2023 compliance)
- Include `consent_version` field in request body — reject if missing
- Use `crypto.randomUUID()` for inquiry IDs
- This is a new routing subtree — update worker.ts path routing

**Ecosystem Caveat:**
After inquiry is created, emit `real_estate.inquiry.submitted` event if T-RE-ENH-13 is implemented. If not yet done, add a TODO comment.

**Do Not:**
- Allow PII access across tenants
- Accept JWT-less GET requests
- Use Math.random() for IDs
- Forget to update worker.ts
```

---

## PROMPT: T-RE-ENH-03 Implementation

```markdown
You are a Replit execution agent implementing a feature in the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-03
**Task Title:** Add Paystack Charge Initiation Endpoint

**Repo Context:**
`webwaka-real-estate` is a Cloudflare Workers API for Nigerian real estate. Part of WebWaka OS v4. Uses Paystack for payments. Webhook handling already exists in `src/modules/transactions/api/index.ts`. All monetary values in integer kobo.

**Objective:**
Add `POST /api/re/transactions/:id/pay` which calls the Paystack Transaction Initialize API to generate a payment link for a transaction.

**Dependencies:**
- Paystack API: `POST https://api.paystack.co/transaction/initialize`
- `PAYSTACK_SECRET_KEY` env var (already in wrangler.toml vars)
- Existing `re_transactions` table

**Before Acting:**
1. Read `src/modules/transactions/api/index.ts` fully — understand existing patterns
2. Read Paystack initialize API docs (https://paystack.com/docs/api/transaction/#initialize)
3. Read `migrations/001_real_estate_schema.sql` — understand re_transactions columns

**Required Deliverables:**
- New route `POST /api/re/transactions/:id/pay` in `src/modules/transactions/api/index.ts`:
  - Requires admin or agent role
  - Fetches transaction from DB (verify tenant_id match)
  - Returns 400 if `payment_status = 'paid'`
  - Calls `https://api.paystack.co/transaction/initialize` with:
    - `amount`: transaction.total_payable_kobo (integer — exact kobo, no conversion)
    - `email`: transaction.buyer_email (required — return 400 if null)
    - `metadata`: `{ tenant_id, transaction_id: transaction.id, listing_id: transaction.listing_id }`
    - `callback_url`: optional (from request body or env var)
  - Returns `{ success: true, data: { authorization_url, access_code, reference } }`
  - Returns 503 if Paystack API unreachable
- Add 4 test cases for this endpoint

**Acceptance Criteria:**
- Amount sent = total_payable_kobo exactly (integer, no float)
- metadata contains tenant_id and transaction_id matching the webhook handler's expectations
- PAYSTACK_SECRET_KEY used as Bearer token in Authorization header
- PAYSTACK_SECRET_KEY never in response body or logs
- Transaction already paid → 400
- Paystack failure → 503 with user-friendly message

**Important Reminders:**
- The webhook handler reads `data.metadata.tenant_id` and `data.metadata.transaction_id` — your metadata MUST match exactly
- Never convert kobo to naira (no division by 100)
- Use `ctx.waitUntil()` only for fire-and-forget operations — this endpoint MUST await Paystack response

**Ecosystem Caveat:**
This repo is backend-only. The frontend repo will redirect buyers to `authorization_url`. Do not build redirect logic here.
```

---

## PROMPT: T-RE-ENH-04 Implementation

```markdown
You are a Replit execution agent fixing CI/CD and adding ESLint in the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-04
**Task Title:** Fix CI/CD Quality Gates and Add ESLint

**Repo Context:**
`webwaka-real-estate` is a Cloudflare Workers API. Part of WebWaka OS v4. GitHub Actions CI is in `.github/workflows/deploy.yml`. All three quality gates (tsc, lint, test) use `|| true` which silently ignores failures.

**Objective:**
1. Add ESLint configuration
2. Fix GitHub Actions workflow to fail on quality gate errors

**Before Acting:**
1. Read `.github/workflows/deploy.yml` fully
2. Read `package.json` fully
3. Read `tsconfig.json` fully
4. Run `npm test` to confirm all 27 existing tests pass

**Required Deliverables:**
- `eslint.config.js` — flat config with `@typescript-eslint/recommended`
- Updated `package.json` — add `"lint": "eslint src/**/*.ts"` script, add `eslint` and `@typescript-eslint/*` to devDependencies
- Updated `.github/workflows/deploy.yml` — remove `|| true` from tsc, lint, and test steps
- Fix any TypeScript or ESLint errors exposed in existing code before removing `|| true`

**Acceptance Criteria:**
- `npm run lint` exits 0 on clean codebase
- `npm run type-check` exits 0 on clean codebase
- `npm test` passes all tests
- `.github/workflows/deploy.yml` has no `|| true` on quality gates
- CI fails when quality checks fail

**Important Reminders:**
- Fix all violations BEFORE removing `|| true`
- Keep quality gate jobs separate (parallel is fine)
- Do not change deployment steps

**Do Not:**
- Remove any existing tests
- Change wrangler deploy steps
- Add new `|| true` anywhere
```

---

## PROMPT: T-RE-ENH-05 Implementation

```markdown
You are a Replit execution agent implementing rate limiting in the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-05
**Task Title:** Implement Rate Limiting Middleware

**Repo Context:**
`webwaka-real-estate` is a Cloudflare Workers API. RATE_LIMIT_KV KV namespace is already configured in wrangler.toml and bound as `env.RATE_LIMIT_KV`. No rate limiting exists.

**Objective:**
Implement a sliding window rate limiter using `RATE_LIMIT_KV` and apply it to:
- GET /api/re/listings (public) — 60 req/min per IP
- POST /api/re/inquiries (public) — 5 req/min per IP
- POST /api/re/transactions/:id/pay — 10 req/min per tenant_id

**Before Acting:**
1. Read `wrangler.toml` to confirm RATE_LIMIT_KV binding names
2. Read all three target route handlers

**Required Deliverables:**
- `src/middleware/rateLimit.ts` — factory function `createRateLimiter({ limit, windowSec, keyFn })` returning Hono middleware
- Apply rate limiter to the three routes listed above
- 429 response: `{ success: false, error: 'Too many requests' }` with `Retry-After: {seconds}` header
- Tests in new `src/middleware/rateLimit.test.ts`

**Acceptance Criteria:**
- 429 returned on limit exceeded
- Retry-After header present
- KV TTL set to windowSec
- If RATE_LIMIT_KV unavailable — fail open (allow request through), do not crash

**Do Not:**
- Block legitimate high-traffic tenants with shared counters
- Use synchronous KV patterns that block response
- Expose KV keys in responses
```

---

## PROMPT: T-RE-ENH-06 Implementation

```markdown
You are a Replit execution agent adding observability to the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-06
**Task Title:** Add Global Error Handler and Request Logging

**Repo Context:**
`webwaka-real-estate` is a Cloudflare Workers Hono API. No error handler or request logging exists. The main entry is `src/worker.ts`.

**Objective:**
1. Add `app.onError()` global error handler to `src/worker.ts`
2. Add request logging middleware

**Required Deliverables:**
- `src/middleware/logger.ts` — `requestLogger` middleware emitting JSON log per request
- `src/middleware/errorHandler.ts` — `globalErrorHandler` function for `app.onError()`
- Update `src/worker.ts` to use both
- Tests for error handler behavior

**Log Shape:** `{ requestId, method, path, status, duration_ms, tenant_id, env }`
**Error Shape:** `{ success: false, error: { message, requestId, timestamp } }` — stack only in development

**Acceptance Criteria:**
- All requests produce JSON log
- Unhandled exceptions return structured 500
- Production: no stack traces
- Development: stack traces in response
- requestId correlates log and error response

**Do Not:**
- Log JWT values
- Log PAYSTACK_SECRET_KEY
- Log request body contents (may contain PII)
```

---

## PROMPT: T-RE-ENH-07 Implementation

```markdown
You are a Replit execution agent fixing a security gap in the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-07
**Task Title:** Fix Agent Listing Ownership Enforcement

**Repo Context:**
`webwaka-real-estate` is a Cloudflare Workers Hono API. `PATCH /api/re/listings/:id` allows any `agent` role to update any listing in the tenant. This must be restricted to agents assigned to the listing.

**Objective:**
Add ownership check to `PATCH /api/re/listings/:id` — agents can only patch listings they are assigned to via `re_agent_listings`.

**Before Acting:**
1. Read `src/modules/listings/api/index.ts` fully — focus on PATCH handler
2. Read `migrations/001_real_estate_schema.sql` — understand `re_agent_listings` schema

**Required Deliverables:**
Update the PATCH handler:
- If `userRole === 'agent'`: query `re_agents` to find agent record for `userId`; then query `re_agent_listings` to check assignment; return 403 if not assigned
- If `userRole === 'admin'` or `'super_admin'`: no ownership check
- Add test cases for the ownership gate

**Acceptance Criteria:**
- Assigned agent → PATCH succeeds
- Unassigned agent → 403 with clear error
- Admin → PATCH succeeds regardless
- User with agent role but no agent profile → 403

**Do Not:**
- Break admin access
- Add ownership check to GET or DELETE routes (DELETE is admin-only already)
```

---

## PROMPT: T-RE-ENH-08 Implementation

```markdown
You are a Replit execution agent implementing geolocation search in the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-08
**Task Title:** Implement Geolocation Search

**Repo Context:**
`webwaka-real-estate` is a Cloudflare Workers Hono API. `re_listings` table has `latitude REAL` and `longitude REAL` columns. GET /api/re/listings has no geo filtering.

**Objective:**
Add `lat`, `lng`, `radius_km` query parameters to `GET /api/re/listings` for proximity search.

**Required Deliverables:**
- Bounding box pre-filter added to search query when geo params present
- Haversine distance computed in SELECT and used for filtering/ordering
- `distance_km` field included in each result when geo params provided
- Results sorted by distance when geo search active
- Listings without lat/lng excluded from geo results
- Tests for geo search accuracy

**Algorithm:**
```
delta_lat = radius_km / 111.0
delta_lng = radius_km / (111.0 * cos(lat_rad))
WHERE lat BETWEEN (lat - delta_lat) AND (lat + delta_lat)
  AND lng BETWEEN (lng - delta_lng) AND (lng + delta_lng)
  AND (6371 * acos(...haversine...)) <= radius_km
```

**Acceptance Criteria:**
- Listings within radius returned with correct distance_km
- Listings outside radius excluded
- lat without lng → 400
- radius_km without lat/lng → 400 (or ignored)
- Works with all other existing filters

**Do Not:**
- Remove existing non-geo search functionality
- Allow client to inject SQL via geo params (parameterize all values)
```

---

## PROMPT: T-RE-ENH-09 Implementation

```markdown
You are a Replit execution agent adding full-text search to the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-09
**Task Title:** Add FTS5 Full-Text Search for Listings

**Repo Context:**
`webwaka-real-estate` uses Cloudflare D1. D1 supports FTS5 (use lowercase `fts5` in SQL or you get "not authorized"). Must use `fts5` not `FTS5`.

**Objective:**
Add a migration creating an FTS5 virtual table and triggers for `re_listings`. Extend GET /api/re/listings to support `q` query param for full-text search.

**Required Deliverables:**
- `migrations/003_fts5_listings.sql` — creates `re_listings_fts` virtual table, INSERT/UPDATE/DELETE triggers
- Updated `src/modules/listings/api/index.ts` — when `q` provided, JOIN with FTS table using `re_listings_fts MATCH ?`, order by `rank`
- Note: FTS5 tables cannot be exported from D1 — document this in a comment
- Tests for FTS search (mock FTS JOIN)

**Critical:** Use lowercase `fts5`, not `FTS5`. Cloudflare D1 FTS5 is case-sensitive on the module name.

**Acceptance Criteria:**
- `?q=duplex` returns listings with "duplex" in title/description/address
- Case-insensitive search (lowercase `q` before passing to MATCH)
- FTS triggers maintain sync on insert/update/delete
- When `q` is empty or not provided, normal search used
- FTS and other filters composable

**Do Not:**
- Use FTS5 for filtering by price or bedroom count (use regular WHERE for those)
- Forget D1 export limitation comment
```

---

## PROMPT: T-RE-ENH-10 Implementation

```markdown
You are a Replit execution agent implementing cursor-based pagination in the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-10
**Task Title:** Implement Cursor-Based Pagination

**Repo Context:**
All list endpoints in `webwaka-real-estate` currently use offset/limit pagination which breaks on large, changing datasets.

**Objective:**
Replace offset-based pagination with cursor-based pagination on all list endpoints.

**Cursor Design:**
- Cursor = base64(JSON.stringify({ ts: created_at, id: id }))
- Query: WHERE (created_at < cursor_ts) OR (created_at = cursor_ts AND id < cursor_id) ORDER BY created_at DESC, id DESC LIMIT ?

**Required Deliverables:**
- `src/utils/pagination.ts` — `encodeCursor(ts, id)`, `decodeCursor(cursor)` helpers
- Update GET /api/re/listings, GET /api/re/transactions, GET /api/re/agents to use cursor pagination
- Response meta: `{ limit, next_cursor: string|null, has_more: boolean }`
- Accept `cursor` query param; keep `offset` as deprecated param with `meta.deprecation_warning`

**Acceptance Criteria:**
- First page: `next_cursor` set when results = limit
- Next page via cursor: correct sequential results
- Last page: `next_cursor = null`
- Invalid cursor → 400 with clear message
- Offset still works but triggers deprecation warning

**Do Not:**
- Break existing functionality with cursor changes
- Allow cursor injection (decode + validate before use)
```

---

## PROMPT: T-RE-ENH-11 Implementation

```markdown
You are a Replit execution agent adding R2 signed URLs to the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-11
**Task Title:** Add R2 Signed URL Endpoint for Agent Documents

**Repo Context:**
Agent ESVARBON certificates are uploaded to Cloudflare R2 (`DOCUMENTS` binding) and stored with their key in `re_agents.esvarbon_doc_key`. No endpoint exists to retrieve them.

**Objective:**
Add `GET /api/re/agents/:id/documents/url` to generate a time-limited presigned URL for the agent's uploaded document.

**Required Deliverables:**
- New route handler in `src/modules/agents/api/index.ts`
- `GET /api/re/agents/:id/documents/url` — admin only
- Checks agent has `esvarbon_doc_key`
- Calls `DOCUMENTS.createPresignedUrl(key, { expiresIn: 3600 })`
- Returns `{ success: true, data: { url, expires_in: 3600 } }`
- Tests: agent with doc → URL returned; agent without doc → 404; non-admin → 403

**Acceptance Criteria:**
- URL returned for agent with uploaded document
- 404 if agent has no document
- 403 for non-admin callers
- Expiry = 3600 seconds (1 hour)

**Note:** Verify Cloudflare R2 presigned URL API (`createPresignedUrl`) syntax against current Cloudflare Workers TypeScript types before implementing.

**Do Not:**
- Return the R2 key itself in the response
- Cache the presigned URL (it expires)
```

---

## PROMPT: T-RE-ENH-12 Implementation

```markdown
You are a Replit execution agent adding an audit log to the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-12
**Task Title:** Build Agent Verification Audit Log

**Repo Context:**
Agent verification state transitions in `webwaka-real-estate` overwrite existing state with no history. NDPA 2023 requires audit trails for sensitive data processing decisions.

**Objective:**
Add `re_agent_verification_log` table and record every state transition.

**Required Deliverables:**
- `migrations/004_verification_audit_log.sql` — create append-only log table
- Update all verification handlers (verify, approve, reject, document upload) to insert a log entry using `ctx.waitUntil()` or a batch insert
- `GET /api/re/agents/:id/verification/history` — admin only, returns log in chronological order
- Tests for log creation on each action

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS re_agent_verification_log (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL,
  action TEXT NOT NULL, triggered_by TEXT, reason TEXT, created_at INTEGER NOT NULL
);
```

**Acceptance Criteria:**
- Every state transition creates a log entry
- No UPDATE/DELETE routes on this table
- History returns in created_at ASC order
- triggered_by = admin user_id or 'system' for automated API calls

**Do Not:**
- Allow deletion of log entries
- Store sensitive data (esvarbon_api_raw content) in the log
```

---

## PROMPT: T-RE-ENH-13 Implementation

```markdown
You are a Replit execution agent implementing event emission in the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-13
**Task Title:** Implement Inter-Service Event Emission

**Repo Context:**
`webwaka-real-estate` is part of WebWaka OS v4 event-driven platform. Other repos (notifications, analytics, fintech) need signals from this repo. `INTER_SERVICE_SECRET` and `CENTRAL_MGMT_URL` env vars are already in wrangler.toml.

**Objective:**
Add event emission after: transaction completed, agent verified, inquiry submitted.

**Required Deliverables:**
- `src/services/eventEmitter.ts` — `emitEvent(event, data, env, ctx)` function
- Update transaction status handler (→ 'completed' triggers event)
- Update agent approve/verify handler (triggers event)
- Update inquiry POST handler (triggers event)
- Tests confirming events are emitted correctly and failures don't break responses

**Event Shape:**
```typescript
{
  event: string,
  source: 'webwaka-real-estate',
  tenant_id: string,
  timestamp: number,
  data: Record<string, unknown>
}
```

**Critical Rules:**
- Use `ctx.waitUntil(emitEvent(...))` — NEVER await directly in handler
- If CENTRAL_MGMT_URL not set → `console.log(JSON.stringify({event, data}))` only
- If fetch fails → catch silently, log error, do NOT throw
- INTER_SERVICE_SECRET in Authorization header, never in payload

**Do Not:**
- Block API responses waiting for event emission
- Expose INTER_SERVICE_SECRET in logs or responses
- Assume CENTRAL_MGMT_URL is always set
```

---

## PROMPT: T-RE-ENH-14 Implementation

```markdown
You are a Replit execution agent adding shortlet availability to the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-14
**Task Title:** Add Shortlet Calendar Availability API

**Repo Context:**
`webwaka-real-estate` supports `listing_type = 'shortlet'` but has no availability calendar. This makes shortlet listings functionally unusable for booking.

**Objective:**
Add block-out date management and availability check for shortlet listings.

**Required Deliverables:**
- `migrations/005_shortlet_calendar.sql` — `re_shortlet_availability` table
- `src/modules/shortlet/api/index.ts` — Three routes (availability check, block dates, unblock date)
- Update `src/worker.ts` to route `/api/re/shortlet/*`
- Tests

**Routes:**
- `GET /api/re/shortlet/:listingId/availability?from=YYYY-MM-DD&to=YYYY-MM-DD` — Public. Returns `{ dates: [{date, available}] }`
- `POST /api/re/shortlet/:listingId/availability` — Admin/agent. Body: `{ dates: ['YYYY-MM-DD', ...], reason: string }`
- `DELETE /api/re/shortlet/:listingId/availability/:date` — Admin/agent.

**Acceptance Criteria:**
- Only shortlet listings can have availability managed (check listing_type = 'shortlet')
- Available dates not in `re_shortlet_availability`
- Blocked dates in that table
- tenant_id enforced throughout
```

---

## PROMPT: T-RE-ENH-15 Implementation

```markdown
You are a Replit execution agent adding NDPA consent tracking to the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-15
**Task Title:** Implement NDPA Consent Tracking for Inquiries

**Repo Context:**
Nigeria's NDPA 2023 (fully effective September 2025) requires explicit consent before processing PII. Inquiry forms collect buyer name, phone, and email. This must be consent-gated.

**Objective:**
Add `consent_given`, `consent_version`, `consent_timestamp` to inquiry submissions.

**Prerequisites:** T-RE-ENH-02 (Inquiries API) must already be implemented.

**Required Deliverables:**
- `migrations/006_inquiry_consent.sql` — ALTER TABLE re_inquiries to add consent columns
- Update `POST /api/re/inquiries` to require `consent_given: true` and `consent_version` in body
- Return 400 with NDPA reference if consent not given
- Store `consent_timestamp = Date.now()` on submission
- Tests: without consent → 400; with consent → 201

**Error Message:**
`"Consent to process your personal data is required under Nigeria's Data Protection Act 2023 (NDPA). Please provide consent_given: true and consent_version."`

**Do Not:**
- Allow submissions without explicit `consent_given: true` (not truthy — must be boolean true)
- Store consent_version as the actual policy text (store a short version identifier only)
```

---

## PROMPT: T-RE-ENH-16 Implementation

```markdown
You are a Replit execution agent fixing ID generation in the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-16
**Task Title:** Replace Math.random() ID Generation with crypto.randomUUID()

**Repo Context:**
All entity IDs in `webwaka-real-estate` use `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,9)}`. This is not collision-safe.

**Objective:**
Replace all Math.random()-based ID generation with `crypto.randomUUID()`.

**Before Acting:**
Search for all occurrences of `Math.random()` in `src/`.

**Required Deliverables:**
- Replace every ID generation pattern in listings, transactions, agents, payments modules
- Remove `const id = \`re_lst_${Date.now()}_${Math.random()...}\`` pattern everywhere
- Replace with `const id = crypto.randomUUID()`
- Update tests if they check ID format (update regex to UUID format)

**Note:** `crypto.randomUUID()` is available in Cloudflare Workers without any import. Do not install a UUID package.

**Acceptance Criteria:**
- Zero `Math.random()` calls in ID generation code
- All created entities have UUID v4 format IDs
- All existing tests still pass
```

---

## PROMPT: T-RE-ENH-17 Implementation

```markdown
You are a Replit execution agent adding market analytics to the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-17
**Task Title:** Add Market Analytics Endpoints

**Repo Context:**
`webwaka-real-estate` has rich listing data but no analytics endpoints. Nigerian proptech platforms (PropertyPro, PrivateProperty) all offer market data.

**Objective:**
Add `GET /api/re/analytics/market` with aggregate market data for a tenant.

**Required Deliverables:**
- `src/modules/analytics/api/index.ts`
- Update `src/worker.ts` to route `/api/re/analytics/*`
- Endpoint: `GET /api/re/analytics/market` — admin/agent role required
- Optional filters: `state`, `listing_type`, `property_type`
- Returns: `total_listings`, `avg_price_kobo`, `avg_price_per_sqm_kobo`, `listings_by_state`, `listings_by_type`
- Cache result in `TENANT_CONFIG` KV for 5 minutes (key: `analytics:market:{tenant_id}:{filter_hash}`)
- Tests

**SQL Aggregations:**
```sql
SELECT COUNT(*) as total, AVG(price_kobo) as avg_price,
  AVG(CASE WHEN size_sqm > 0 THEN price_kobo/size_sqm ELSE NULL END) as avg_per_sqm
FROM re_listings WHERE tenant_id = ? AND status = 'active'
```

**Do Not:**
- Return unaggregated listing data in analytics response
- Cache across tenants (tenant isolation must apply to cache keys too)
```

---

## PROMPT: T-RE-ENH-18 Implementation

```markdown
You are a Replit execution agent adding ESLint to the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-18
**Task Title:** Add ESLint Configuration

**Repo Context:**
No ESLint config exists in `webwaka-real-estate`. CI references `npm run lint` which fails.

**Objective:**
Add `eslint.config.js` (flat config, ESLint v9) and update package.json.

**Required Deliverables:**
- `eslint.config.js` with `@typescript-eslint/recommended`
- `package.json` — add lint script, add devDependencies
- Fix any lint violations in existing code

**Config:**
```javascript
import tseslint from 'typescript-eslint';
import globals from 'globals';
export default tseslint.config(
  { ignores: ['node_modules/', '.wrangler/'] },
  tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser } },
    rules: { '@typescript-eslint/no-explicit-any': 'warn', 'no-console': 'off' } }
);
```

**Do Not:**
- Set rules to 'error' that would break existing code
- Ignore src/ directory
```

---

## PROMPT: T-RE-ENH-19 Implementation

```markdown
You are a Replit execution agent adding test coverage to the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-19
**Task Title:** Add Comprehensive Tests for Listings and Transactions Modules

**Repo Context:**
`webwaka-real-estate` has 27 tests for the agents module. Listings and transactions have ZERO tests. The mock patterns are established in `src/modules/agents/api/index.test.ts`.

**Objective:**
Create comprehensive test files for listings and transactions modules.

**Before Acting:**
1. Read `src/modules/agents/api/index.test.ts` — copy mock patterns exactly
2. Read `src/modules/listings/api/index.ts` fully
3. Read `src/modules/transactions/api/index.ts` fully

**Required Deliverables:**
- `src/modules/listings/api/index.test.ts` — Minimum 15 test cases
- `src/modules/transactions/api/index.test.ts` — Minimum 12 test cases
- All tests must pass with `npm test`

**Critical Tests:**
Listings:
- GET /listings returns empty array when no listings
- POST /listings succeeds for verified agent
- POST /listings blocked for unverified agent (403)
- POST /listings rejects float price_kobo (400)
- PATCH /listings/:id validates monetary fields
- DELETE /listings/:id soft-deletes

Transactions:
- POST /transactions computes total_payable_kobo correctly
- POST /transactions rejects zero agreed_price_kobo (400)
- POST /webhooks/paystack verifies HMAC signature (valid and invalid)
- POST /webhooks/paystack idempotent on duplicate reference
- PATCH /transactions/:id/status rejects invalid status

**Do Not:**
- Make real network calls (mock fetch for Paystack webhook tests)
- Skip HMAC verification test (it's security-critical)
```

---

## PROMPT: T-RE-ENH-20 Implementation

```markdown
You are a Replit execution agent adding Paystack subscriptions to the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-20
**Task Title:** Paystack Subscription for Recurring Rent Payments

**Prerequisites:** T-RE-ENH-03 (Paystack charge initiation) must be implemented first.

**Objective:**
Add subscription plan management for `rent` transactions using Paystack Subscriptions API.

**Required Deliverables:**
- `migrations/007_paystack_subscriptions.sql` — `re_subscriptions` table
- `POST /api/re/transactions/:id/subscribe` — Create Paystack plan + subscription
- `DELETE /api/re/transactions/:id/subscribe` — Cancel subscription
- Extend webhook handler for `invoice.payment_failed`, `subscription.not_renew` events
- Tests

**Paystack Subscription Flow:**
1. Create Plan: `POST https://api.paystack.co/plan` (`{ name, interval: 'monthly', amount: monthly_kobo }`)
2. Create Customer: `POST https://api.paystack.co/customer` if needed
3. Initialize: `POST https://api.paystack.co/transaction/initialize` with `plan` field set

**Acceptance Criteria:**
- Only `transaction_type = 'rent'` allowed (400 for sale)
- plan_code and subscription_code stored in `re_subscriptions`
- Webhook invoice.payment_failed → updates amount_paid_kobo and payment_status
- Cancellation: calls Paystack disable_subscription API, updates DB
```

---

## PROMPT: T-RE-ENH-21 Implementation

```markdown
You are a Replit execution agent fixing migrations configuration in the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-21
**Task Title:** Fix wrangler.toml Migrations Directory Configuration

**Objective:**
Add `migrations_dir = "migrations"` to the D1 database binding in wrangler.toml. Update README with correct migration commands.

**Required Deliverables:**
- Updated `wrangler.toml` — add `migrations_dir = "migrations"` to the [[d1_databases]] block
- Updated `README.md` — correct migration commands
- Verify `wrangler d1 migrations apply webwaka-real-estate-local --local` works

**Note:** This is a simple config change. Read `wrangler.toml` fully before editing.
```

---

## PROMPT: T-RE-ENH-22 Implementation

```markdown
You are a Replit execution agent adding Vitest configuration to the `webwaka-real-estate` repository.

**Task ID:** T-RE-ENH-22
**Task Title:** Add Vitest Configuration for Cloudflare Workers Environment

**Objective:**
Add `vitest.config.ts` using `@cloudflare/vitest-pool-workers` for more realistic test execution.

**Required Deliverables:**
- Install `@cloudflare/vitest-pool-workers`
- Create `vitest.config.ts`
- Verify all 27 existing tests still pass
- Update `package.json` test script if needed

**Config:**
```typescript
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
export default defineWorkersConfig({
  test: { poolOptions: { workers: { wrangler: { configPath: './wrangler.toml' } } } },
});
```

**Acceptance Criteria:**
- `npm test` runs all tests using the new config
- All 27 existing tests pass
- No regressions

**Note:** If `@cloudflare/vitest-pool-workers` causes breaking changes to existing mock patterns, document the changes needed and implement them. The goal is MORE realistic tests, not fewer passing ones.
```

---

# SECTION 9 — QA PROMPTS

---

## QA PROMPT: T-RE-ENH-01

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-01 (Listing Image Upload/Delete) in `webwaka-real-estate`.

**Verification Steps:**
1. Inspect `src/modules/listings/api/index.ts` for POST /listings/:id/images and DELETE /listings/:id/images/:imageId handlers
2. Verify file type validation (JPEG, PNG, WEBP allowed; others rejected)
3. Verify size limit enforcement (10MB max)
4. Verify R2.put called with correct key format `listings/{tenantId}/{listingId}/img_{ts}.{ext}`
5. Verify DB insert into `re_listing_images` with correct columns
6. Verify is_primary = 1 set for first image, 0 for subsequent
7. Verify DELETE calls R2.delete AND removes DB row
8. Verify primary image promotion on delete of primary
9. Verify tenant_id isolation on all DB queries
10. Run `npm test` — all tests must pass

**Bugs to Look For:**
- R2.put called with wrong content-type
- is_primary logic inverted or missing
- Primary promotion: wrong SQL (must find next by sort_order)
- R2 object not deleted when DB row deleted
- tenant_id missing from DB queries
- Image ID using Math.random() (must use crypto.randomUUID())

**Fix all bugs found directly. Re-test after each fix. Report final state.**
```

---

## QA PROMPT: T-RE-ENH-02

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-02 (Inquiries API) in `webwaka-real-estate`.

**Verification Steps:**
1. Inspect `src/modules/inquiries/api/index.ts` — all 4 routes present
2. Verify `src/worker.ts` routes `/api/re/inquiries/*` to inquiries app
3. Verify POST is public (no JWT required)
4. Verify POST validates listing exists and is active
5. Verify POST requires consent_given: true and consent_version (NDPA compliance)
6. Verify GET and PATCH require admin or agent role
7. Verify status transitions validated (only valid statuses accepted)
8. Verify tenant_id isolation on all queries
9. Run `npm test` — all tests pass

**Bugs to Look For:**
- Missing routing in worker.ts
- Public POST accidentally requiring JWT
- Status update accepting arbitrary strings
- Inquiry created for listing in wrong tenant
- consent_given check missing or accepting non-boolean

**Fix all bugs found. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-03

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-03 (Paystack Charge Initiation) in `webwaka-real-estate`.

**Verification Steps:**
1. Inspect POST /api/re/transactions/:id/pay handler
2. Verify amount sent to Paystack = total_payable_kobo (integer, no float conversion)
3. Verify metadata includes tenant_id and transaction_id matching webhook handler expectations
4. Verify PAYSTACK_SECRET_KEY used as Authorization Bearer, never in response
5. Verify already-paid transaction returns 400
6. Verify Paystack API failure returns 503 with user-friendly error
7. Run `npm test` — tests for this endpoint pass

**Critical Security Audit:**
- Grep for any logging of PAYSTACK_SECRET_KEY value
- Verify Authorization header format: `Bearer {key}` (not `Paystack {key}`)
- Verify amount is integer in the POST body to Paystack

**Webhook Correlation Audit:**
- The webhook handler reads `data.metadata.tenant_id` — verify charge initiation sets exactly `metadata.tenant_id` (same key name)
- Verify `metadata.transaction_id` matches `transaction.id` exactly

**Fix all bugs. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-04

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-04 (CI/CD Fix) in `webwaka-real-estate`.

**Verification Steps:**
1. Read `.github/workflows/deploy.yml` — confirm ZERO occurrences of `|| true` on tsc, lint, test steps
2. Read `eslint.config.js` — confirm it exists and covers src/**/*.ts
3. Run `npm run lint` — must exit 0
4. Run `npm run type-check` — must exit 0
5. Run `npm test` — all 27 tests pass
6. Introduce intentional TypeScript error — `npm run type-check` must exit non-zero
7. Introduce intentional lint error — `npm run lint` must exit non-zero
8. Introduce intentional test failure — `npm test` must exit non-zero

**Bugs to Look For:**
- Any remaining `|| true` in quality gate steps
- ESLint not finding TypeScript files
- TypeScript config excluding test files (tests should be type-checked too)
- Deployment steps accidentally broken

**Fix all issues. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-05

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-05 (Rate Limiting) in `webwaka-real-estate`.

**Verification Steps:**
1. Inspect `src/middleware/rateLimit.ts` — middleware factory exists
2. Verify rate limiter applied to: GET /listings, POST /inquiries, POST /transactions/:id/pay
3. Verify 429 response format: `{ success: false, error: 'Too many requests' }`
4. Verify Retry-After header present on 429
5. Verify KV key namespaced by route and IP/tenant_id
6. Verify fail-open behavior when KV is unavailable
7. Run rate limiter tests

**Security Audit:**
- Rate limit key must NOT be spoofable by client-provided headers (e.g., X-Forwarded-For manipulation)
- Ensure counter is per-route, not global

**Fix all bugs. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-06

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-06 (Error Handler + Logging) in `webwaka-real-estate`.

**Verification Steps:**
1. Verify `app.onError()` registered in `src/worker.ts`
2. Trigger an unhandled exception — response must be `{ success: false, error: { message, requestId } }`
3. Verify requestId is UUID format
4. Set ENVIRONMENT=production — verify NO stack trace in response
5. Set ENVIRONMENT=development — verify stack trace in response
6. Verify every request produces a JSON log line with required fields
7. Verify no JWT or payment keys in log output

**PII Audit:**
- Request body is NOT logged (buyer phone, email in inquiry body must not appear in logs)
- Paystack webhook body is NOT logged in full (raw body contains payment details)

**Fix all issues. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-07

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-07 (Agent Ownership) in `webwaka-real-estate`.

**Verification Steps:**
1. Inspect PATCH /api/re/listings/:id handler — ownership check present
2. Verify agent assigned to listing can PATCH it → 200
3. Verify agent NOT assigned to listing → 403
4. Verify admin bypasses ownership check → 200 on any listing
5. Verify user with agent role but no agent record in DB → 403
6. Run all tests — existing tests still pass

**Regression Check:**
- GET /listings still works for agents
- POST /listings still works for verified agents
- DELETE /listings still admin-only

**Fix all issues. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-08

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-08 (Geolocation Search) in `webwaka-real-estate`.

**Verification Steps:**
1. Inspect GET /api/re/listings handler — geo filtering logic present
2. Verify bounding box pre-filter uses correct delta_lat/delta_lng calculation
3. Verify Haversine formula correct (validate against known city distances)
4. Verify distance_km field present in response when geo params provided
5. Verify listings without lat/lng excluded from geo results
6. Verify invalid lat/lng returns 400
7. Verify geo search combined with price/type filters works
8. Run all tests

**Test Coordinates:**
- Lagos: lat=6.5244, lng=3.3792
- Abuja: lat=9.0579, lng=7.4951
- Distance Lagos-Abuja ≈ 480km — a 100km radius search from Lagos should not include Abuja

**Fix all issues. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-09

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-09 (FTS5 Search) in `webwaka-real-estate`.

**Verification Steps:**
1. Inspect `migrations/003_fts5_listings.sql` — virtual table uses lowercase `fts5`, NOT `FTS5`
2. Verify INSERT, UPDATE, DELETE triggers present
3. Inspect GET /listings handler — FTS JOIN present when q param provided
4. Verify case-insensitive search (query lowercased before MATCH)
5. Verify FTS combined with other filters works
6. Verify graceful fallback when q is empty
7. Run tests

**Critical Checks:**
- `fts5` (lowercase) — if `FTS5` used → "not authorized" on Cloudflare D1
- Trigger correctness: UPDATE trigger should delete old entry and insert new
- FTS search with special characters: `?q=3+bedroom` (URL-encoded space)

**Fix all issues. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-10

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-10 (Cursor Pagination) in `webwaka-real-estate`.

**Verification Steps:**
1. Inspect all list endpoints — cursor param accepted, offset deprecated
2. Verify first page returns next_cursor
3. Verify second page using cursor returns correct results
4. Verify no duplicates between pages
5. Verify last page has next_cursor = null
6. Verify invalid cursor → 400
7. Verify old offset param still works with deprecation warning
8. Run tests

**Edge Cases to Test:**
- Exactly 1 result (single page)
- Empty dataset (next_cursor = null from first call)
- Cursor from another tenant rejected (tenant isolation)

**Fix all issues. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-11

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-11 (R2 Signed URLs) in `webwaka-real-estate`.

**Verification Steps:**
1. Inspect GET /api/re/agents/:id/documents/url handler
2. Verify admin-only access (403 for agent role)
3. Verify agent without esvarbon_doc_key → 404
4. Verify agent with esvarbon_doc_key → URL returned
5. Verify expiresIn = 3600 passed to createPresignedUrl
6. Run tests

**Cloudflare-Specific Check:**
- Verify `DOCUMENTS.createPresignedUrl` API matches current Cloudflare Workers R2 TypeScript types
- If API differs, adapt implementation to match actual available API

**Fix all issues. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-12

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-12 (Verification Audit Log) in `webwaka-real-estate`.

**Verification Steps:**
1. Inspect `migrations/004_verification_audit_log.sql` — table created correctly
2. Verify every verification handler inserts a log entry (verify, approve, reject, doc_upload)
3. Verify log entries cannot be modified (no UPDATE/DELETE routes on log table)
4. Verify history endpoint returns entries in chronological order
5. Verify triggered_by is set correctly (admin user_id or 'system')
6. Verify tenant_id isolation
7. Run tests

**Compliance Audit:**
- Confirm NO esvarbon_api_raw or sensitive content in log entries
- Confirm from_status and to_status correctly capture the transition

**Fix all issues. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-13

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-13 (Event Emission) in `webwaka-real-estate`.

**Verification Steps:**
1. Inspect `src/services/eventEmitter.ts` — emitEvent function present
2. Verify emitEvent called in transaction status handler (→ 'completed')
3. Verify emitEvent called in agent approve/verify handler (→ 'verified')
4. Verify emitEvent called in inquiry POST handler
5. Verify `ctx.waitUntil(emitEvent(...))` pattern used (not direct await)
6. Verify event emission failure does NOT fail the API response
7. Verify INTER_SERVICE_SECRET in Authorization header, not in payload
8. Verify CENTRAL_MGMT_URL not set → event logged as JSON only
9. Run tests

**Cross-Repo Audit:**
- Event shape must match what other WebWaka repos expect: `{ event, source, tenant_id, timestamp, data }`
- tenant_id present in every event

**Fix all issues. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-14

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-14 (Shortlet Calendar) in `webwaka-real-estate`.

**Verification Steps:**
1. Inspect `migrations/005_shortlet_calendar.sql`
2. Inspect `src/modules/shortlet/api/index.ts`
3. Verify `src/worker.ts` routes /api/re/shortlet/* correctly
4. Verify availability check returns correct date array
5. Verify blocking dates marks them unavailable
6. Verify unblocking dates marks them available again
7. Verify non-shortlet listing → 400
8. Verify tenant_id isolation
9. Run tests

**Fix all issues. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-15

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-15 (NDPA Consent) in `webwaka-real-estate`.

**Verification Steps:**
1. Verify POST /inquiries without consent_given → 400 with NDPA error message
2. Verify POST with consent_given = false → 400
3. Verify POST with consent_given = true + consent_version → 201
4. Verify consent_timestamp stored on successful submission
5. Inspect migration — consent columns added to re_inquiries
6. Run tests

**Legal Compliance Audit:**
- Error message must reference NDPA 2023 explicitly
- consent_given must be strict boolean `true` (not truthy value like 1 or "true")
- consent_version stored immutably with record

**Fix all issues. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-16

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-16 (UUID IDs) in `webwaka-real-estate`.

**Verification Steps:**
1. Grep for `Math.random()` in `src/` — must return ZERO results in ID generation contexts
2. Grep for `crypto.randomUUID()` — must appear in all create handlers
3. Run all tests — all pass
4. Verify created entity IDs match UUID v4 regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`

**Fix any remaining Math.random() ID usage. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-17

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-17 (Market Analytics) in `webwaka-real-estate`.

**Verification Steps:**
1. Inspect GET /api/re/analytics/market handler
2. Verify aggregations correct for known test data
3. Verify price_per_sqm excludes null/zero size_sqm
4. Verify KV caching with 5-minute TTL
5. Verify tenant isolation (tenant A cannot see tenant B's data)
6. Verify empty dataset returns zeros, not null/undefined
7. Verify admin/agent role required
8. Run tests

**Fix all issues. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-18

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-18 (ESLint) in `webwaka-real-estate`.

**Verification Steps:**
1. Verify `eslint.config.js` exists
2. Verify `npm run lint` exits 0 on clean codebase
3. Introduce a lint violation (e.g., `const x: any = 1`) — `npm run lint` must exit non-zero
4. Remove violation — lint passes again
5. Verify all src/**/*.ts files covered by lint

**Fix all issues. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-19

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-19 (Listings + Transactions Tests) in `webwaka-real-estate`.

**Verification Steps:**
1. Verify `src/modules/listings/api/index.test.ts` exists with ≥15 test cases
2. Verify `src/modules/transactions/api/index.test.ts` exists with ≥12 test cases
3. Run `npm test` — ALL tests pass (including new and existing 27)
4. Verify HMAC webhook test present and tests invalid signature
5. Verify monetary integrity tests present (float rejected)
6. Verify unverified agent publication gate tested

**Critical Tests Must Be Present:**
- Paystack webhook with invalid HMAC → 401
- POST /listings with float price_kobo → 400
- POST /listings with unverified agent → 403
- POST /transactions with non-integer agreed_price_kobo → 400

**Fix all failing tests. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-20

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-20 (Paystack Subscriptions) in `webwaka-real-estate`.

**Verification Steps:**
1. Inspect POST /api/re/transactions/:id/subscribe handler
2. Verify sale transaction → 400 (subscriptions for rent only)
3. Verify rent transaction → Paystack plan created, subscription_code stored
4. Verify webhook handler processes invoice.payment_failed
5. Verify DELETE /subscribe calls Paystack disable API
6. Run tests

**Fix all issues. Re-test. Report.**
```

---

## QA PROMPT: T-RE-ENH-21

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-21 (Migrations Config) in `webwaka-real-estate`.

**Verification Steps:**
1. Read `wrangler.toml` — verify `migrations_dir = "migrations"` present in [[d1_databases]] block
2. Run `wrangler d1 migrations apply webwaka-real-estate-local --local` — must succeed
3. Read `README.md` — verify migration commands are correct

**Fix any remaining issues. Report.**
```

---

## QA PROMPT: T-RE-ENH-22

```markdown
You are a Replit QA and Bug-Fix agent verifying T-RE-ENH-22 (Vitest Config) in `webwaka-real-estate`.

**Verification Steps:**
1. Verify `vitest.config.ts` exists
2. Run `npm test` — all tests pass with new config
3. Verify test pool uses Cloudflare Workers environment
4. Count total passing tests — must be ≥27 (no regressions)

**Fix any regressions. Re-test. Report.**
```

---

# SECTION 10 — PRIORITY ORDER

## Phase 1 — Critical (Implement First)

| Priority | Task ID | Task | Reason |
|----------|---------|------|--------|
| 1 | T-RE-ENH-04 | Fix CI/CD quality gates + ESLint | CI gives false confidence today |
| 2 | T-RE-ENH-18 | ESLint configuration | Required before CI fix |
| 3 | T-RE-ENH-16 | Replace Math.random() with UUID | Security/correctness, quick win |
| 4 | T-RE-ENH-06 | Global error handler + logging | Blind without this in production |
| 5 | T-RE-ENH-07 | Agent ownership enforcement | Active security vulnerability |
| 6 | T-RE-ENH-01 | Listing image upload/delete | Core feature, completely missing |
| 7 | T-RE-ENH-02 | Inquiries API | Core feature, schema ready |
| 8 | T-RE-ENH-03 | Paystack charge initiation | Payment flow incomplete |
| 9 | T-RE-ENH-05 | Rate limiting | API unprotected |
| 10 | T-RE-ENH-19 | Listings + transactions tests | Zero coverage on critical modules |
| 11 | T-RE-ENH-21 | Migrations config fix | DevEx/CI reliability |

## Phase 2 — High Value (After Phase 1)

| Priority | Task ID | Task |
|----------|---------|------|
| 12 | T-RE-ENH-12 | Verification audit log |
| 13 | T-RE-ENH-15 | NDPA consent tracking |
| 14 | T-RE-ENH-11 | R2 signed URLs for documents |
| 15 | T-RE-ENH-13 | Inter-service event emission |
| 16 | T-RE-ENH-08 | Geolocation search |
| 17 | T-RE-ENH-09 | FTS5 full-text search |
| 18 | T-RE-ENH-10 | Cursor-based pagination |

## Phase 3 — Enhancement (After Phase 2)

| Priority | Task ID | Task |
|----------|---------|------|
| 19 | T-RE-ENH-17 | Market analytics endpoints |
| 20 | T-RE-ENH-14 | Shortlet calendar |
| 21 | T-RE-ENH-20 | Paystack subscription |
| 22 | T-RE-ENH-22 | Vitest Cloudflare config |

---

# SECTION 11 — DEPENDENCIES

```
T-RE-ENH-18 (ESLint) → must complete before T-RE-ENH-04 (CI fix removes || true)
T-RE-ENH-16 (UUID) → no dependencies
T-RE-ENH-21 (migrations config) → should be done before adding new migrations (ENH-09, 12, 14, 15, 20)
T-RE-ENH-02 (Inquiries API) → T-RE-ENH-15 (NDPA consent) depends on it
T-RE-ENH-03 (Paystack init) → T-RE-ENH-20 (Subscriptions) depends on it
T-RE-ENH-08 (Geo search) → independent
T-RE-ENH-09 (FTS5) → independent, but adds migration (do T-RE-ENH-21 first)
T-RE-ENH-13 (Event emission) → independent but should be done after T-RE-ENH-02 (inquiries)
T-RE-ENH-19 (Tests) → best done after T-RE-ENH-01 (images) so image routes can be tested
T-RE-ENH-04 (CI fix) → T-RE-ENH-18 (ESLint) + existing tests passing
```

**Full Dependency Graph:**
```
T-RE-ENH-18 ──────────────────────┐
                                  ▼
T-RE-ENH-16 ──── (any order) ──► T-RE-ENH-04 (CI fix)
T-RE-ENH-19 ──────────────────────┘

T-RE-ENH-21 ──► T-RE-ENH-09 (FTS5, adds migration)
                T-RE-ENH-12 (audit log, adds migration)
                T-RE-ENH-14 (calendar, adds migration)
                T-RE-ENH-15 (consent, adds migration)
                T-RE-ENH-20 (subscriptions, adds migration)

T-RE-ENH-02 ──► T-RE-ENH-15 (NDPA consent on inquiries)
                T-RE-ENH-13 (inquiry event emission)

T-RE-ENH-03 ──► T-RE-ENH-20 (Paystack subscriptions)
```

---

# SECTION 12 — PHASE 1 / PHASE 2 SPLIT

## Phase 1 Deliverables (Critical Foundation)

After Phase 1, the repo will have:
- Working CI/CD with real quality gates
- ESLint enforced
- UUID IDs throughout
- Global error handling and request logging
- Agent listing ownership security fix
- Complete listing image management API
- Complete inquiries API
- Complete Paystack payment initiation
- Rate limiting on sensitive endpoints
- Comprehensive test coverage for all modules
- Correct migrations configuration

**Phase 1 milestone:** The repo is production-safe and functionally complete for basic real estate operations.

## Phase 2 Deliverables (Quality and Compliance)

After Phase 2, the repo will have:
- NDPA 2023 consent tracking
- Agent verification audit log
- R2 signed URL retrieval for documents
- Inter-service event emission
- Geolocation search
- FTS5 full-text search
- Cursor-based pagination

**Phase 2 milestone:** The repo is compliance-ready, ecosystem-connected, and feature-competitive with leading Nigerian proptech platforms.

## Phase 3 Deliverables (Advanced Features)

After Phase 3, the repo will have:
- Market analytics API
- Shortlet calendar/availability
- Paystack recurring rent subscriptions
- Cloudflare Workers vitest pool

**Phase 3 milestone:** The repo offers premium proptech capabilities and full shortlet market support.

---

# SECTION 13 — REPO CONTEXT AND ECOSYSTEM NOTES

## Critical Ecosystem Awareness

1. **`@webwaka/core` is a shared contract.** Changes to `jwtAuthMiddleware`, `requireRole`, or `getTenantId` in the core package will break this repo. When implementing features that depend on these, check the core package docs first.

2. **This repo is backend-only.** There is no frontend here. All API responses must be designed for consumption by the WebWaka frontend repo (likely a React PWA). When adding new fields or endpoints, document the response shape for the frontend team.

3. **Event bus contract is implicit.** The `real_estate.*` events emitted by T-RE-ENH-13 must match whatever schema the notifications, analytics, and fintech repos expect. Before implementing event emission, verify the event schema with other repos in the WebWaka ecosystem.

4. **Paystack webhook metadata correlation.** The webhook handler reads `data.metadata.tenant_id` and `data.metadata.transaction_id`. The charge initiation endpoint (T-RE-ENH-03) MUST use exactly these field names in metadata — any mismatch silently breaks payment reconciliation.

5. **D1 is shared across environments.** The staging D1 database (`modules_prod`) is shared between staging and there is only one prod D1 configured. Be careful with migration destructiveness.

6. **RATE_LIMIT_KV and TENANT_CONFIG are separate KV namespaces.** Do not accidentally use TENANT_CONFIG for rate limiting or vice versa.

7. **INTER_SERVICE_SECRET authenticates inter-service calls.** Any event emission to `CENTRAL_MGMT_URL` must use this secret. Never expose it.

8. **Nigerian phone numbers** in inquiries follow specific formats (+234..., 0...). Consider validation but do not break existing data.

## What This Repo Does NOT Own

- **Authentication/JWT issuance** — Owned by WebWaka auth/identity service
- **User profiles** — Owned by another WebWaka repo
- **Notification delivery** (email, SMS, push) — Owned by WebWaka notifications repo
- **Financial settlements** (agent payouts) — Owned by WebWaka fintech repo (see NIBSS NIP integration in T-FIN-01)
- **Frontend PWA** — Separate WebWaka frontend repo
- **Admin dashboard** — Likely in a separate WebWaka admin repo

---

# SECTION 14 — GOVERNANCE AND REMINDER BLOCK

## WebWaka OS v4 Platform Principles (Must Honor in Every Task)

| Principle | Application to This Repo |
|-----------|--------------------------|
| **Build Once Use Infinitely** | Auth from `@webwaka/core` only — never re-implement JWT logic here |
| **Mobile/PWA/Offline First** | API responses must support offline-first patterns (ETags, pagination tokens) |
| **Nigeria-First, Africa-Ready** | All monetary values in kobo; ESVARBON compliance; NDPA consent; Nigerian phone formats |
| **Vendor Neutral AI** | If AI features added, use OpenRouter pattern from @webwaka/core, not hardcoded OpenAI |
| **Multi-Tenant Tenant-as-Code** | tenant_id on EVERY table; EVERY query must be scoped; NEVER trust client tenant_id on write routes |
| **Event-Driven** | NO direct inter-service DB access; events via CENTRAL_MGMT_URL only |
| **Thoroughness Over Speed** | Full test coverage; full error handling; full validation before shipping |
| **Zero Skipping Policy** | No `|| true` on CI; no TODO comments left unresolved in shipped code |
| **Multi-Repo Platform Architecture** | This repo is one component; don't build features that belong in other repos |
| **Governance-Driven Execution** | Consult Blueprint references in code comments before changing architecture |
| **CI/CD Native Development** | Every change must pass CI before merge; no manual deploys without CI |
| **Cloudflare-First Deployment** | Use D1, R2, KV, Workers primitives; do not add external databases |

## Monetary Integrity Reminders

- ALL monetary values: INTEGER KOBO (NGN × 100). No floats. No decimals. No currency strings.
- When calling Paystack: send integer kobo directly (Paystack natively uses kobo for Nigerian transactions)
- When displaying to users: divide by 100 in the FRONTEND, never in this API
- Validate: `Number.isInteger(value) && value > 0` for prices, `Number.isInteger(value) && value >= 0` for fees

## Security Reminders

- NEVER log JWT values, PAYSTACK_SECRET_KEY, INTER_SERVICE_SECRET, ESVARBON_API_KEY
- NEVER trust client-provided tenant_id on write routes (always from JWT)
- ALWAYS use parameterized queries (D1.prepare().bind()) — never string interpolation in SQL
- ALWAYS verify HMAC signatures on webhooks before processing
- ALWAYS scope R2 keys to `{tenantId}/{entityType}/{entityId}/...` format

---

# SECTION 15 — EXECUTION READINESS NOTES

## What Is Ready to Execute Immediately

All 22 tasks in this taskbook are implementation-ready:
- The repo is already running (Cloudflare Workers, D1, R2 configured)
- The `@webwaka/core` dependency is installed and working
- 27 existing tests provide a regression baseline
- The health check at `/health` confirms the worker is operational
- The ESVARBON verification state machine is fully implemented and tested

## What Needs External Input Before Execution

- **T-RE-ENH-13 (Event Emission):** The event schema expected by other WebWaka repos should be confirmed with the platform team before implementing. The proposed schema in this taskbook is a reasonable starting point.
- **T-RE-ENH-03 (Paystack):** Verify the current Paystack API shape (may have changed since implementation). Check `https://paystack.com/docs/api/transaction/#initialize`.
- **T-RE-ENH-11 (R2 Signed URLs):** Verify `DOCUMENTS.createPresignedUrl()` is available in the current Cloudflare Workers R2 TypeScript types. The API name may differ.

## Testing Strategy

- All tasks include vitest test requirements
- Use the mock patterns established in `src/modules/agents/api/index.test.ts` as the template
- Mock D1 with `{ prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnThis(), first: vi.fn(), all: vi.fn(), run: vi.fn() }) }`
- Mock R2 with `{ put: vi.fn(), delete: vi.fn(), createPresignedUrl: vi.fn() }`
- Mock `fetch` globally with `vi.stubGlobal('fetch', vi.fn())`
- Always call `vi.restoreAllMocks()` in `afterEach`

## Deployment Checklist Before Production

After implementing all Phase 1 tasks:
1. Run `npm test` — all tests pass
2. Run `npm run type-check` — zero errors
3. Run `npm run lint` — zero errors
4. Apply D1 migrations in staging: `wrangler d1 migrations apply modules_prod --env staging --remote`
5. Deploy to staging: `wrangler deploy --env staging`
6. Health check: `curl https://webwaka-real-estate-api-staging.webwaka.workers.dev/health`
7. Test all new endpoints manually against staging
8. Apply D1 migrations in production
9. Deploy to production

## Known Technical Debt (Not in This Taskbook)

- The `vite.config` and `tsconfig.build.json` referenced in package.json scripts don't exist (build scripts are unused for Cloudflare Workers which uses wrangler for bundling)
- `react` and `react-dom` in dependencies are unused (this is a pure Cloudflare Worker — no React frontend)
- These can be cleaned up in a housekeeping task

---

*End of WEBWAKA-REAL-ESTATE-DEEP-RESEARCH-TASKBOOK.md*
*Document generated: 2026-04-04*
*Repo: webwaka-real-estate | Platform: WebWaka OS v4 | Target: Cloudflare Workers*
