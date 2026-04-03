/**
 * WebWaka Real Estate — Listings Module API
 *
 * Handles property listing CRUD, search, and image management.
 * All monetary values stored as integer kobo.
 * All routes scoped by tenant_id from JWT.
 *
 * Routes:
 *   GET    /api/re/listings            — search/list listings (public)
 *   GET    /api/re/listings/:id        — get listing detail (public)
 *   POST   /api/re/listings            — create listing (agent, admin)
 *   PATCH  /api/re/listings/:id        — update listing (agent, admin)
 *   DELETE /api/re/listings/:id        — delete listing (admin)
 *   POST   /api/re/listings/:id/images — upload listing image (agent, admin)
 *   DELETE /api/re/listings/:id/images/:imageId — delete image (agent, admin)
 *
 * Blueprint Reference: Part 9.2 (Multi-Tenancy, Monetary Integrity)
 * Blueprint Reference: Part 9.3 (RBAC — requireRole)
 * T-RES-01: Unverified agents blocked from publishing; verified badge in detail.
 */
import { Hono } from 'hono';
import { jwtAuthMiddleware, requireRole, getTenantId } from '@webwaka/core';

export interface Env {
  DB: D1Database;
  DOCUMENTS: R2Bucket;
  TENANT_CONFIG: KVNamespace;
  JWT_SECRET: string;
  ENVIRONMENT?: string;
}

const app = new Hono<{ Bindings: Env }>();

// Public routes — no auth required
const PUBLIC_ROUTES = ['/api/re/listings', '/api/re/listings/'];

app.use('/api/re/*', jwtAuthMiddleware({ publicRoutes: PUBLIC_ROUTES }));

// ─── GET /api/re/listings — Search listings ───────────────────────────────────
app.get('/api/re/listings', async (c) => {
  const tenantId = getTenantId(c) ?? c.req.query('tenant_id');
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const listingType = c.req.query('type');
  const propertyType = c.req.query('property_type');
  const state = c.req.query('state');
  const city = c.req.query('city');
  const minPrice = c.req.query('min_price');
  const maxPrice = c.req.query('max_price');
  const bedrooms = c.req.query('bedrooms');
  const verifiedOnly = c.req.query('verified_agents_only') === '1';
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);
  const offset = parseInt(c.req.query('offset') ?? '0');

  // Include whether the listing has at least one verified agent (for badge display)
  let query = `SELECT l.*,
               GROUP_CONCAT(i.r2_key) as image_keys,
               MAX(CASE WHEN a.verification_status = 'verified' THEN 1 ELSE 0 END) as has_verified_agent
               FROM re_listings l
               LEFT JOIN re_listing_images i ON i.listing_id = l.id AND i.is_primary = 1
               LEFT JOIN re_agent_listings al ON al.listing_id = l.id AND al.tenant_id = l.tenant_id
               LEFT JOIN re_agents a ON a.id = al.agent_id
               WHERE l.tenant_id = ? AND l.status = 'active'`;
  const params: (string | number)[] = [tenantId];

  if (listingType) { query += ' AND l.listing_type = ?'; params.push(listingType); }
  if (propertyType) { query += ' AND l.property_type = ?'; params.push(propertyType); }
  if (state) { query += ' AND l.state = ?'; params.push(state); }
  if (city) { query += ' AND l.city LIKE ?'; params.push(`%${city}%`); }
  if (minPrice) { query += ' AND l.price_kobo >= ?'; params.push(parseInt(minPrice)); }
  if (maxPrice) { query += ' AND l.price_kobo <= ?'; params.push(parseInt(maxPrice)); }
  if (bedrooms) { query += ' AND l.bedrooms >= ?'; params.push(parseInt(bedrooms)); }
  if (verifiedOnly) { query += " AND a.verification_status = 'verified'"; }

  query += ' GROUP BY l.id ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const results = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ success: true, data: results.results, meta: { limit, offset } });
});

// ─── GET /api/re/listings/:id — Get listing detail ────────────────────────────
app.get('/api/re/listings/:id', async (c) => {
  const tenantId = getTenantId(c) ?? c.req.query('tenant_id');
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const id = c.req.param('id');
  const listing = await c.env.DB.prepare(
    `SELECT * FROM re_listings WHERE id = ? AND tenant_id = ?`
  ).bind(id, tenantId).first();

  if (!listing) return c.json({ success: false, error: 'Listing not found' }, 404);

  const images = await c.env.DB.prepare(
    `SELECT * FROM re_listing_images WHERE listing_id = ? ORDER BY sort_order ASC`
  ).bind(id).all();

  // Include verification badge fields for each assigned agent
  const agents = await c.env.DB.prepare(
    `SELECT a.id, a.full_name, a.phone, a.email, a.esvarbon_reg_no,
            a.esvarbon_verified, a.verification_status, a.verified_at, al.role,
            CASE WHEN a.verification_status = 'verified' THEN 1 ELSE 0 END as is_verified_badge
     FROM re_agent_listings al
     JOIN re_agents a ON a.id = al.agent_id
     WHERE al.listing_id = ? AND al.tenant_id = ?`
  ).bind(id, tenantId).all();

  const hasVerifiedAgent = (agents.results as Array<{ is_verified_badge: number }>)
    .some(a => a.is_verified_badge === 1);

  return c.json({
    success: true,
    data: {
      ...listing,
      images: images.results,
      agents: agents.results,
      has_verified_agent: hasVerifiedAgent,
    },
  });
});

// ─── POST /api/re/listings — Create listing ───────────────────────────────────
// T-RES-01: Agents must be ESVARBON-verified to publish listings.
app.post('/api/re/listings', requireRole(['agent', 'admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const user = (c as any).get('user') as { sub?: string; role?: string } | undefined;
  const userId = user?.sub ?? null;
  const userRole = user?.role ?? 'agent';

  // Non-admin agents must be verified before publishing
  if (userRole === 'agent') {
    const agentRecord = await c.env.DB.prepare(
      `SELECT id, verification_status, esvarbon_verified
       FROM re_agents WHERE user_id = ? AND tenant_id = ? AND status = 'active'`
    ).bind(userId, tenantId).first<{ id: string; verification_status: string; esvarbon_verified: number }>();

    if (!agentRecord) {
      return c.json({
        success: false,
        error: 'No active agent profile found for your account. Contact an admin to register you.',
      }, 403);
    }

    if (agentRecord.verification_status !== 'verified' || !agentRecord.esvarbon_verified) {
      return c.json({
        success: false,
        error: 'Only ESVARBON-verified agents can publish listings. Your verification status: ' + agentRecord.verification_status,
        data: { verification_status: agentRecord.verification_status },
      }, 403);
    }
  }

  const body = await c.req.json<{
    title: string;
    description?: string;
    listing_type: string;
    property_type: string;
    bedrooms?: number;
    bathrooms?: number;
    toilets?: number;
    size_sqm?: number;
    price_kobo: number;
    service_charge_kobo?: number;
    caution_fee_kobo?: number;
    agency_fee_kobo?: number;
    address: string;
    city: string;
    state: string;
    lga?: string;
    latitude?: number;
    longitude?: number;
  }>();

  // Validate required fields
  if (!body.title || !body.listing_type || !body.property_type || !body.address || !body.city || !body.state) {
    return c.json({ success: false, error: 'Missing required fields: title, listing_type, property_type, address, city, state' }, 400);
  }

  // Monetary integrity: price_kobo must be positive integer
  if (!Number.isInteger(body.price_kobo) || body.price_kobo <= 0) {
    return c.json({ success: false, error: 'price_kobo must be a positive integer (kobo)' }, 400);
  }

  const id = `re_lst_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO re_listings
       (id, tenant_id, title, description, listing_type, property_type, bedrooms, bathrooms, toilets,
        size_sqm, price_kobo, service_charge_kobo, caution_fee_kobo, agency_fee_kobo,
        address, city, state, lga, latitude, longitude, status, is_verified, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?, ?)`
  ).bind(
    id, tenantId, body.title, body.description ?? null,
    body.listing_type, body.property_type,
    body.bedrooms ?? null, body.bathrooms ?? null, body.toilets ?? null, body.size_sqm ?? null,
    body.price_kobo,
    body.service_charge_kobo ?? 0, body.caution_fee_kobo ?? 0, body.agency_fee_kobo ?? 0,
    body.address, body.city, body.state, body.lga ?? null,
    body.latitude ?? null, body.longitude ?? null,
    userId ?? 'system', now, now,
  ).run();

  return c.json({ success: true, data: { id, status: 'active', created_at: now } }, 201);
});

// ─── PATCH /api/re/listings/:id — Update listing ──────────────────────────────
app.patch('/api/re/listings/:id', requireRole(['agent', 'admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const now = Date.now();

  // Validate monetary fields if present
  for (const field of ['price_kobo', 'service_charge_kobo', 'caution_fee_kobo', 'agency_fee_kobo']) {
    if (field in body && (!Number.isInteger(body[field]) || (body[field] as number) < 0)) {
      return c.json({ success: false, error: `${field} must be a non-negative integer (kobo)` }, 400);
    }
  }

  // Build dynamic update
  const allowed = ['title', 'description', 'listing_type', 'property_type', 'bedrooms', 'bathrooms',
    'toilets', 'size_sqm', 'price_kobo', 'service_charge_kobo', 'caution_fee_kobo', 'agency_fee_kobo',
    'address', 'city', 'state', 'lga', 'latitude', 'longitude', 'status'];
  const updates: string[] = [];
  const params: unknown[] = [];
  for (const key of allowed) {
    if (key in body) { updates.push(`${key} = ?`); params.push(body[key]); }
  }
  if (!updates.length) return c.json({ success: false, error: 'No valid fields to update' }, 400);

  updates.push('updated_at = ?');
  params.push(now, id, tenantId);

  const result = await c.env.DB.prepare(
    `UPDATE re_listings SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...params).run();

  if (!result.meta.changes) return c.json({ success: false, error: 'Listing not found' }, 404);
  return c.json({ success: true, data: { id, updated_at: now } });
});

// ─── DELETE /api/re/listings/:id — Delete listing ─────────────────────────────
app.delete('/api/re/listings/:id', requireRole(['admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const id = c.req.param('id');
  const result = await c.env.DB.prepare(
    `UPDATE re_listings SET status = 'inactive', updated_at = ? WHERE id = ? AND tenant_id = ?`
  ).bind(Date.now(), id, tenantId).run();

  if (!result.meta.changes) return c.json({ success: false, error: 'Listing not found' }, 404);
  return c.json({ success: true, data: { id, status: 'inactive' } });
});

export default app;
