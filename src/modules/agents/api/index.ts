/**
 * WebWaka Real Estate — Agents Module API
 *
 * Manages estate agent profiles, ESVARBON compliance, and listing assignments.
 *
 * Routes:
 *   GET    /api/re/agents            — list agents (admin)
 *   GET    /api/re/agents/:id        — get agent detail (admin, agent)
 *   POST   /api/re/agents            — register agent (admin)
 *   PATCH  /api/re/agents/:id        — update agent (admin)
 *   POST   /api/re/agents/:id/listings/:listingId — assign agent to listing (admin)
 *   DELETE /api/re/agents/:id/listings/:listingId — remove agent from listing (admin)
 *
 * Blueprint Reference: Part 9.3 (RBAC — requireRole)
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

app.use('/api/re/agents*', jwtAuthMiddleware({ publicRoutes: [] }));

// ─── GET /api/re/agents — List agents ─────────────────────────────────────────
app.get('/api/re/agents', requireRole(['admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);
  const offset = parseInt(c.req.query('offset') ?? '0');

  const agents = await c.env.DB.prepare(
    `SELECT a.*, COUNT(al.listing_id) as active_listings
     FROM re_agents a
     LEFT JOIN re_agent_listings al ON al.agent_id = a.id
     WHERE a.tenant_id = ? AND a.status = 'active'
     GROUP BY a.id
     ORDER BY a.full_name ASC LIMIT ? OFFSET ?`
  ).bind(tenantId, limit, offset).all();

  return c.json({ success: true, data: agents.results, meta: { limit, offset } });
});

// ─── GET /api/re/agents/:id — Get agent detail ────────────────────────────────
app.get('/api/re/agents/:id', requireRole(['admin', 'super_admin', 'agent']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const id = c.req.param('id');
  const agent = await c.env.DB.prepare(
    `SELECT * FROM re_agents WHERE id = ? AND tenant_id = ?`
  ).bind(id, tenantId).first();

  if (!agent) return c.json({ success: false, error: 'Agent not found' }, 404);

  const listings = await c.env.DB.prepare(
    `SELECT l.id, l.title, l.address, l.city, l.state, l.listing_type, l.price_kobo, l.status, al.role
     FROM re_agent_listings al
     JOIN re_listings l ON l.id = al.listing_id
     WHERE al.agent_id = ? AND al.tenant_id = ?
     ORDER BY al.assigned_at DESC`
  ).bind(id, tenantId).all();

  return c.json({ success: true, data: { ...agent, listings: listings.results } });
});

// ─── POST /api/re/agents — Register agent ─────────────────────────────────────
app.post('/api/re/agents', requireRole(['admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const body = await c.req.json<{
    user_id: string;
    full_name: string;
    phone: string;
    email: string;
    esvarbon_reg_no?: string;
    bio?: string;
  }>();

  if (!body.user_id || !body.full_name || !body.phone || !body.email) {
    return c.json({ success: false, error: 'Missing required fields: user_id, full_name, phone, email' }, 400);
  }

  const id = `re_agt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO re_agents (id, tenant_id, user_id, full_name, phone, email, esvarbon_reg_no, esvarbon_verified, bio, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'active', ?, ?)`
  ).bind(id, tenantId, body.user_id, body.full_name, body.phone, body.email,
    body.esvarbon_reg_no ?? null, body.bio ?? null, now, now).run();

  return c.json({ success: true, data: { id, status: 'active' } }, 201);
});

// ─── PATCH /api/re/agents/:id — Update agent ──────────────────────────────────
app.patch('/api/re/agents/:id', requireRole(['admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const now = Date.now();

  const allowed = ['full_name', 'phone', 'email', 'esvarbon_reg_no', 'esvarbon_verified', 'bio', 'status'];
  const updates: string[] = [];
  const params: unknown[] = [];
  for (const key of allowed) {
    if (key in body) { updates.push(`${key} = ?`); params.push(body[key]); }
  }
  if (!updates.length) return c.json({ success: false, error: 'No valid fields to update' }, 400);

  updates.push('updated_at = ?');
  params.push(now, id, tenantId);

  const result = await c.env.DB.prepare(
    `UPDATE re_agents SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...params).run();

  if (!result.meta.changes) return c.json({ success: false, error: 'Agent not found' }, 404);
  return c.json({ success: true, data: { id, updated_at: now } });
});

// ─── POST /api/re/agents/:id/listings/:listingId — Assign agent ───────────────
app.post('/api/re/agents/:id/listings/:listingId', requireRole(['admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const agentId = c.req.param('id');
  const listingId = c.req.param('listingId');
  const body = await c.req.json<{ role?: string }>().catch(() => ({}));
  const role = body.role ?? 'primary';

  const assignId = `re_al_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO re_agent_listings (id, tenant_id, agent_id, listing_id, role, assigned_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(assignId, tenantId, agentId, listingId, role, Date.now()).run();

  return c.json({ success: true, data: { agent_id: agentId, listing_id: listingId, role } });
});

// ─── DELETE /api/re/agents/:id/listings/:listingId — Remove assignment ─────────
app.delete('/api/re/agents/:id/listings/:listingId', requireRole(['admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const agentId = c.req.param('id');
  const listingId = c.req.param('listingId');

  await c.env.DB.prepare(
    `DELETE FROM re_agent_listings WHERE agent_id = ? AND listing_id = ? AND tenant_id = ?`
  ).bind(agentId, listingId, tenantId).run();

  return c.json({ success: true });
});

export default app;
