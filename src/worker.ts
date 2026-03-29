/**
 * WebWaka Real Estate Suite — Cloudflare Worker Entry Point
 *
 * Platform Invariants Enforced:
 * 1. Build Once Use Infinitely — all auth from @webwaka/core
 * 2. Mobile First — Hono lightweight API
 * 3. PWA First — Cloudflare Workers + Pages
 * 4. Offline First — Dexie mutation queue (client-side)
 * 5. Nigeria First — Paystack kobo, en-NG locale
 * 6. Africa First — multi-locale i18n
 * 7. Vendor Neutral AI — OpenRouter abstraction
 *
 * Security Mandates:
 * - secureCORS(): NO wildcard CORS
 * - rateLimit(): ALL auth + mutation endpoints rate-limited
 * - jwtAuthMiddleware(): ALL /api/* routes require valid JWT
 * - tenantId ALWAYS from JWT payload, NEVER from headers or body
 */

import { Hono } from 'hono';
import { secureCORS, rateLimit, jwtAuthMiddleware } from './middleware/auth';
import { propertyListingsRouter } from './modules/property-listings';
import { tenancyMgmtRouter } from './modules/tenancy-mgmt';
import { mortgageCalcRouter } from './modules/mortgage-calc';

export interface Bindings {
  DB: D1Database;
  SESSIONS_KV: KVNamespace;
  RATE_LIMIT_KV: KVNamespace;
  PROPERTY_MEDIA: R2Bucket;
  JWT_SECRET: string;
  PAYSTACK_SECRET_KEY: string;
  OPENROUTER_API_KEY: string;
  TERMII_API_KEY: string;
  ENVIRONMENT: 'staging' | 'production';
}

const app = new Hono<{ Bindings: Bindings }>();

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use('*', async (c, next) => {
  const corsMiddleware = secureCORS(c.env.ENVIRONMENT);
  return corsMiddleware(c, next);
});

// ─── Rate Limiting (auth + mutation endpoints) ────────────────────────────────
app.use('/api/auth/*', async (c, next) => {
  const limiter = rateLimit(c.env.RATE_LIMIT_KV, { maxRequests: 10, windowSeconds: 60 });
  return limiter(c, next);
});

// ─── Health Check (public) ────────────────────────────────────────────────────
app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'webwaka-real-estate',
    version: '0.1.0',
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  })
);

// ─── JWT Auth Guard (all /api/* routes) ──────────────────────────────────────
app.use('/api/*', async (c, next) => {
  const authMiddleware = jwtAuthMiddleware(c.env.JWT_SECRET, c.env.SESSIONS_KV);
  return authMiddleware(c, next);
});

// ─── Module Routers ───────────────────────────────────────────────────────────
app.route('/api/properties', propertyListingsRouter);
app.route('/api/tenancy', tenancyMgmtRouter);
app.route('/api/mortgage', mortgageCalcRouter);

// ─── 404 Fallback ─────────────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  // No console.log — use structured error response only
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
