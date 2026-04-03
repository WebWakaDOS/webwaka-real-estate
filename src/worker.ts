/**
 * WebWaka Real Estate — Unified Cloudflare Worker Entry Point
 *
 * Single Cloudflare Worker serving all WebWaka Real Estate modules.
 * Routing is based on URL path prefix.
 *
 * ─── Module Routing ───────────────────────────────────────────────────────────
 *   /api/re/listings/*         → Listings module (property search, CRUD)
 *   /api/re/transactions/*     → Transactions module (sale/rent lifecycle)
 *   /api/re/agents/*           → Agents module (ESVARBON compliance)
 *   /api/re/webhooks/paystack  → Paystack webhook (no auth middleware)
 *   /health                    → Platform health check
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Blueprint Reference: Part 9.1 (Cloudflare-First: D1, R2, KV, Workers)
 * Blueprint Reference: Part 9.2 (Multi-Tenancy, Monetary Integrity)
 * Blueprint Reference: Part 9.3 (RBAC — requireRole)
 * Added: 2026-04-01 — Remediation Issue #10 (real-estate scaffold)
 */
import listingsApp from './modules/listings/api/index';
import transactionsApp from './modules/transactions/api/index';
import agentsApp from './modules/agents/api/index';

export interface Env {
  DB: D1Database;
  DOCUMENTS: R2Bucket;
  TENANT_CONFIG: KVNamespace;
  RATE_LIMIT_KV?: KVNamespace;
  JWT_SECRET: string;
  PAYSTACK_SECRET_KEY?: string;
  INTER_SERVICE_SECRET?: string;
  CENTRAL_MGMT_URL?: string;
  ENVIRONMENT?: string;
  // T-RES-01: ESVARBON agent verification (optional — absence triggers manual fallback)
  ESVARBON_API_URL?: string;
  ESVARBON_API_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── Global health check ────────────────────────────────────────────────
    if (path === '/health') {
      return Response.json({
        success: true,
        data: {
          service: 'webwaka-real-estate',
          status: 'healthy',
          modules: ['listings', 'transactions', 'agents'],
          environment: env.ENVIRONMENT ?? 'development',
          timestamp: Date.now(),
        },
      });
    }

    // ── Listings module ────────────────────────────────────────────────────
    // Routes: /api/re/listings/*
    if (path.startsWith('/api/re/listings')) {
      return listingsApp.fetch(request, env, ctx);
    }

    // ── Transactions module ────────────────────────────────────────────────
    // Routes: /api/re/transactions/*, /api/re/webhooks/paystack
    if (path.startsWith('/api/re/transactions') || path.startsWith('/api/re/webhooks')) {
      return transactionsApp.fetch(request, env, ctx);
    }

    // ── Agents module ──────────────────────────────────────────────────────
    // Routes: /api/re/agents/*
    if (path.startsWith('/api/re/agents')) {
      return agentsApp.fetch(request, env, ctx);
    }

    // ── 404 ───────────────────────────────────────────────────────────────
    return Response.json({ success: false, errors: ['Not Found'] }, { status: 404 });
  },
};
