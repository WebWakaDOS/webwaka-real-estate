/**
 * Property Listings Module — WebWaka Real Estate Suite
 *
 * Endpoints:
 *   GET    /api/properties          — list properties (paginated, filtered)
 *   GET    /api/properties/:id      — get single property
 *   POST   /api/properties          — create property listing
 *   PATCH  /api/properties/:id      — update property listing
 *   DELETE /api/properties/:id      — delete property listing
 *
 * Security:
 *   - tenantId ALWAYS from JWT context (c.get('tenantId')) — NEVER from headers/body
 *   - requireRole enforced on all mutation endpoints
 *   - All D1 queries include WHERE tenant_id = ? for tenant isolation
 */

import { Hono } from 'hono';
import { requireRole } from '../../middleware/auth';
import type { Bindings } from '../../core/types';

export const propertyListingsRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/properties — list properties (VIEWER and above)
propertyListingsRouter.get('/', requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'PROPERTY_AGENT', 'VIEWER']), async (c) => {
  const tenantId = c.get('tenantId'); // Invariant: ALWAYS from JWT
  const page = parseInt(c.req.query('page') ?? '1');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);
  const listingType = c.req.query('listing_type');
  const state = c.req.query('state');
  const type = c.req.query('type');
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM properties WHERE tenant_id = ?';
  const params: (string | number)[] = [tenantId];

  if (listingType) { query += ' AND listing_type = ?'; params.push(listingType); }
  if (state) { query += ' AND state = ?'; params.push(state); }
  if (type) { query += ' AND type = ?'; params.push(type); }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  const countQuery = 'SELECT COUNT(*) as total FROM properties WHERE tenant_id = ?';
  const { results: countResult } = await c.env.DB.prepare(countQuery).bind(tenantId).all();
  const total = (countResult[0] as { total: number })?.total ?? 0;

  return c.json({
    data: results,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /api/properties/:id — get single property
propertyListingsRouter.get('/:id', requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'PROPERTY_AGENT', 'VIEWER']), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM properties WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).all();

  if (!results.length) return c.json({ error: 'Property not found' }, 404);
  return c.json({ data: results[0] });
});

// POST /api/properties — create property (PROPERTY_AGENT and above)
propertyListingsRouter.post('/', requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'PROPERTY_AGENT']), async (c) => {
  const tenantId = c.get('tenantId'); // Invariant: ALWAYS from JWT
  const userId = c.get('userId');
  const body = await c.req.json<{
    title: string;
    type: string;
    listingType: string;
    priceKobo: number;
    currency?: string;
    location: string;
    address: string;
    state: string;
    lga: string;
    bedrooms?: number;
    bathrooms?: number;
    sizeM2?: number;
    description: string;
  }>();

  // Validate required fields
  if (!body.title || !body.type || !body.listingType || !body.priceKobo || !body.location || !body.state || !body.description) {
    return c.json({ error: 'Missing required fields: title, type, listingType, priceKobo, location, state, description' }, 400);
  }

  // Validate kobo amount (must be positive integer)
  if (!Number.isInteger(body.priceKobo) || body.priceKobo <= 0) {
    return c.json({ error: 'priceKobo must be a positive integer (kobo amount)' }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO properties (id, tenant_id, title, type, listing_type, status, price_kobo, currency, location, address, state, lga, bedrooms, bathrooms, size_m2, description, agent_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, tenantId, body.title, body.type, body.listingType, body.priceKobo, body.currency ?? 'NGN', body.location, body.address ?? '', body.state, body.lga ?? '', body.bedrooms ?? null, body.bathrooms ?? null, body.sizeM2 ?? null, body.description, userId, now, now).run();

  return c.json({ data: { id, tenantId, ...body, status: 'available', createdAt: now } }, 201);
});

// PATCH /api/properties/:id — update property (PROPERTY_AGENT and above)
propertyListingsRouter.patch('/:id', requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'PROPERTY_AGENT']), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const body = await c.req.json<Partial<{ title: string; status: string; priceKobo: number; description: string }>>();

  const { results } = await c.env.DB.prepare(
    'SELECT id FROM properties WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).all();

  if (!results.length) return c.json({ error: 'Property not found' }, 404);

  if (body.priceKobo !== undefined && (!Number.isInteger(body.priceKobo) || body.priceKobo <= 0)) {
    return c.json({ error: 'priceKobo must be a positive integer' }, 400);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    'UPDATE properties SET title = COALESCE(?, title), status = COALESCE(?, status), price_kobo = COALESCE(?, price_kobo), description = COALESCE(?, description), updated_at = ? WHERE id = ? AND tenant_id = ?'
  ).bind(body.title ?? null, body.status ?? null, body.priceKobo ?? null, body.description ?? null, now, id, tenantId).run();

  return c.json({ data: { id, updatedAt: now } });
});

// DELETE /api/properties/:id — delete property (TENANT_ADMIN and above)
propertyListingsRouter.delete('/:id', requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  const { results } = await c.env.DB.prepare(
    'SELECT id FROM properties WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).all();

  if (!results.length) return c.json({ error: 'Property not found' }, 404);

  await c.env.DB.prepare('DELETE FROM properties WHERE id = ? AND tenant_id = ?').bind(id, tenantId).run();
  return c.json({ data: { id, deleted: true } });
});
