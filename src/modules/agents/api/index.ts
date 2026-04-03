/**
 * WebWaka Real Estate — Agents Module API
 *
 * Manages estate agent profiles, ESVARBON compliance, and listing assignments.
 *
 * Routes:
 *   GET    /api/re/agents                         — list agents (admin)
 *   GET    /api/re/agents/pending-verification    — list agents awaiting review (admin)
 *   GET    /api/re/agents/:id                     — get agent detail (admin, agent)
 *   POST   /api/re/agents                         — register agent (admin)
 *   PATCH  /api/re/agents/:id                     — update agent (admin)
 *   POST   /api/re/agents/:id/documents           — upload ESVARBON certificate to R2 (agent, admin)
 *   POST   /api/re/agents/:id/verify              — trigger ESVARBON verification (admin)
 *   POST   /api/re/agents/:id/verification/approve — admin manual approval (admin)
 *   POST   /api/re/agents/:id/verification/reject  — admin manual rejection (admin)
 *   POST   /api/re/agents/:id/listings/:listingId — assign agent to listing (admin)
 *   DELETE /api/re/agents/:id/listings/:listingId — remove agent from listing (admin)
 *
 * Blueprint Reference: Part 9.3 (RBAC — requireRole)
 * T-RES-01: ESVARBON verification lifecycle
 */
import { Hono } from 'hono';
import { jwtAuthMiddleware, requireRole, getTenantId } from '@webwaka/core';
import { verifyEsvarbonNumber } from '../esvarbon';

export interface Env {
  DB: D1Database;
  DOCUMENTS: R2Bucket;
  TENANT_CONFIG: KVNamespace;
  JWT_SECRET: string;
  ENVIRONMENT?: string;
  ESVARBON_API_URL?: string;
  ESVARBON_API_KEY?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/api/re/agents*', jwtAuthMiddleware({ publicRoutes: [] }));

// ─── GET /api/re/agents — List agents ─────────────────────────────────────────
app.get('/api/re/agents', requireRole(['admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);
  const offset = parseInt(c.req.query('offset') ?? '0');
  const verificationStatus = c.req.query('verification_status');

  let query = `SELECT a.*, COUNT(al.listing_id) as active_listings
     FROM re_agents a
     LEFT JOIN re_agent_listings al ON al.agent_id = a.id
     WHERE a.tenant_id = ? AND a.status = 'active'`;
  const params: (string | number)[] = [tenantId];

  if (verificationStatus) {
    query += ' AND a.verification_status = ?';
    params.push(verificationStatus);
  }

  query += ' GROUP BY a.id ORDER BY a.full_name ASC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const agents = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ success: true, data: agents.results, meta: { limit, offset } });
});

// ─── GET /api/re/agents/pending-verification — Agents awaiting manual review ──
app.get('/api/re/agents/pending-verification', requireRole(['admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const agents = await c.env.DB.prepare(
    `SELECT id, tenant_id, user_id, full_name, phone, email,
            esvarbon_reg_no, verification_status, esvarbon_doc_key,
            esvarbon_doc_uploaded_at, verification_requested_at, created_at
     FROM re_agents
     WHERE tenant_id = ? AND verification_status IN ('pending_docs', 'manual_review')
     ORDER BY verification_requested_at ASC`
  ).bind(tenantId).all();

  return c.json({ success: true, data: agents.results });
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
    `INSERT INTO re_agents
       (id, tenant_id, user_id, full_name, phone, email, esvarbon_reg_no,
        esvarbon_verified, verification_status, bio, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'unverified', ?, 'active', ?, ?)`
  ).bind(id, tenantId, body.user_id, body.full_name, body.phone, body.email,
    body.esvarbon_reg_no ?? null, body.bio ?? null, now, now).run();

  return c.json({ success: true, data: { id, status: 'active', verification_status: 'unverified' } }, 201);
});

// ─── PATCH /api/re/agents/:id — Update agent ──────────────────────────────────
app.patch('/api/re/agents/:id', requireRole(['admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const now = Date.now();

  // verification_status and esvarbon_verified are managed by the verify/approve/reject endpoints
  const allowed = ['full_name', 'phone', 'email', 'esvarbon_reg_no', 'bio', 'status'];
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

// ─── POST /api/re/agents/:id/documents — Upload ESVARBON certificate ──────────
//
// Accepts multipart/form-data with a `document` file field.
// Stores the file in R2 under `agents/{tenantId}/{agentId}/esvarbon_cert_{ts}`.
// Moves the agent to `pending_docs` status (if not already verified).
app.post('/api/re/agents/:id/documents', requireRole(['admin', 'super_admin', 'agent']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const agentId = c.req.param('id');

  const agent = await c.env.DB.prepare(
    `SELECT id, verification_status FROM re_agents WHERE id = ? AND tenant_id = ?`
  ).bind(agentId, tenantId).first<{ id: string; verification_status: string }>();

  if (!agent) return c.json({ success: false, error: 'Agent not found' }, 404);

  if (agent.verification_status === 'verified') {
    return c.json({ success: false, error: 'Agent is already verified' }, 400);
  }

  const formData = await c.req.formData();
  const file = formData.get('document');

  if (!file || !(file instanceof File)) {
    return c.json({ success: false, error: 'document file is required (multipart/form-data)' }, 400);
  }

  // Validate file type
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ success: false, error: 'document must be PDF, JPEG, PNG, or WebP' }, 400);
  }

  // Max 10 MB
  if (file.size > 10 * 1024 * 1024) {
    return c.json({ success: false, error: 'document must not exceed 10 MB' }, 400);
  }

  const now = Date.now();
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1] ?? 'bin';
  const r2Key = `agents/${tenantId}/${agentId}/esvarbon_cert_${now}.${ext}`;

  await c.env.DOCUMENTS.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { tenantId, agentId, uploadedAt: String(now) },
  });

  await c.env.DB.prepare(
    `UPDATE re_agents
     SET esvarbon_doc_key = ?,
         esvarbon_doc_uploaded_at = ?,
         verification_status = CASE WHEN verification_status = 'unverified' THEN 'pending_docs' ELSE verification_status END,
         updated_at = ?
     WHERE id = ? AND tenant_id = ?`
  ).bind(r2Key, now, now, agentId, tenantId).run();

  return c.json({
    success: true,
    data: {
      agent_id: agentId,
      doc_key: r2Key,
      message: 'Document uploaded. Admin review is pending.',
    },
  });
});

// ─── POST /api/re/agents/:id/verify — Trigger ESVARBON verification ───────────
//
// 1. Calls the ESVARBON API with the agent's reg number.
// 2a. If API confirms → marks agent verified (esvarbon_api method).
// 2b. If API says not found → marks rejected.
// 2c. If API unavailable → moves to manual_review (admin sees in pending-verification queue).
app.post('/api/re/agents/:id/verify', requireRole(['admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const agentId = c.req.param('id');
  const now = Date.now();

  const agent = await c.env.DB.prepare(
    `SELECT id, esvarbon_reg_no, verification_status FROM re_agents WHERE id = ? AND tenant_id = ?`
  ).bind(agentId, tenantId).first<{ id: string; esvarbon_reg_no: string | null; verification_status: string }>();

  if (!agent) return c.json({ success: false, error: 'Agent not found' }, 404);

  if (agent.verification_status === 'verified') {
    return c.json({ success: false, error: 'Agent is already verified' }, 400);
  }

  if (!agent.esvarbon_reg_no) {
    return c.json({ success: false, error: 'Agent has no ESVARBON registration number on record' }, 400);
  }

  // Mark as pending_api while we check
  await c.env.DB.prepare(
    `UPDATE re_agents SET verification_status = 'pending_api', verification_requested_at = ?, updated_at = ?
     WHERE id = ? AND tenant_id = ?`
  ).bind(now, now, agentId, tenantId).run();

  const result = await verifyEsvarbonNumber(agent.esvarbon_reg_no, {
    ESVARBON_API_URL: c.env.ESVARBON_API_URL,
    ESVARBON_API_KEY: (c.env as unknown as Record<string, string>)['ESVARBON_API_KEY'],
  });

  if (result.status === 'verified') {
    await c.env.DB.prepare(
      `UPDATE re_agents
       SET verification_status = 'verified',
           esvarbon_verified = 1,
           verification_method = 'esvarbon_api',
           esvarbon_api_raw = ?,
           verified_at = ?,
           rejection_reason = NULL,
           updated_at = ?
       WHERE id = ? AND tenant_id = ?`
    ).bind(result.raw, now, now, agentId, tenantId).run();

    return c.json({
      success: true,
      data: { agent_id: agentId, verification_status: 'verified', method: 'esvarbon_api' },
    });
  }

  if (result.status === 'not_found') {
    await c.env.DB.prepare(
      `UPDATE re_agents
       SET verification_status = 'rejected',
           esvarbon_verified = 0,
           esvarbon_api_raw = ?,
           rejection_reason = 'ESVARBON registration number not found or inactive in the register',
           updated_at = ?
       WHERE id = ? AND tenant_id = ?`
    ).bind(result.raw, now, agentId, tenantId).run();

    return c.json({
      success: false,
      data: { agent_id: agentId, verification_status: 'rejected' },
      error: 'ESVARBON number not found or inactive — agent has been rejected',
    }, 422);
  }

  // API unavailable → move to manual_review queue
  await c.env.DB.prepare(
    `UPDATE re_agents
     SET verification_status = 'manual_review',
         verification_requested_at = ?,
         updated_at = ?
     WHERE id = ? AND tenant_id = ?`
  ).bind(now, now, agentId, tenantId).run();

  return c.json({
    success: true,
    data: {
      agent_id: agentId,
      verification_status: 'manual_review',
      message: result.reason,
    },
  });
});

// ─── POST /api/re/agents/:id/verification/approve — Admin manual approval ─────
app.post('/api/re/agents/:id/verification/approve', requireRole(['admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const agentId = c.req.param('id');
  const user = (c as any).get('user') as { sub?: string } | undefined;
  const adminId = user?.sub ?? 'unknown';
  const now = Date.now();

  const agent = await c.env.DB.prepare(
    `SELECT id, verification_status FROM re_agents WHERE id = ? AND tenant_id = ?`
  ).bind(agentId, tenantId).first<{ id: string; verification_status: string }>();

  if (!agent) return c.json({ success: false, error: 'Agent not found' }, 404);

  if (agent.verification_status === 'verified') {
    return c.json({ success: false, error: 'Agent is already verified' }, 400);
  }

  if (!['pending_docs', 'manual_review', 'rejected', 'pending_api'].includes(agent.verification_status)) {
    return c.json({
      success: false,
      error: `Agent verification_status '${agent.verification_status}' cannot be approved`,
    }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE re_agents
     SET verification_status = 'verified',
         esvarbon_verified = 1,
         verification_method = 'manual',
         verified_at = ?,
         verified_by = ?,
         rejection_reason = NULL,
         updated_at = ?
     WHERE id = ? AND tenant_id = ?`
  ).bind(now, adminId, now, agentId, tenantId).run();

  return c.json({
    success: true,
    data: { agent_id: agentId, verification_status: 'verified', method: 'manual', verified_by: adminId },
  });
});

// ─── POST /api/re/agents/:id/verification/reject — Admin manual rejection ─────
app.post('/api/re/agents/:id/verification/reject', requireRole(['admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const agentId = c.req.param('id');
  const body = await c.req.json<{ reason?: string }>().catch(() => ({}));
  const now = Date.now();

  const agent = await c.env.DB.prepare(
    `SELECT id, verification_status FROM re_agents WHERE id = ? AND tenant_id = ?`
  ).bind(agentId, tenantId).first<{ id: string; verification_status: string }>();

  if (!agent) return c.json({ success: false, error: 'Agent not found' }, 404);

  await c.env.DB.prepare(
    `UPDATE re_agents
     SET verification_status = 'rejected',
         esvarbon_verified = 0,
         rejection_reason = ?,
         updated_at = ?
     WHERE id = ? AND tenant_id = ?`
  ).bind(body.reason ?? 'Rejected by admin', now, agentId, tenantId).run();

  return c.json({
    success: true,
    data: { agent_id: agentId, verification_status: 'rejected', reason: body.reason ?? 'Rejected by admin' },
  });
});

// ─── POST /api/re/agents/:id/listings/:listingId — Assign agent ───────────────
app.post('/api/re/agents/:id/listings/:listingId', requireRole(['admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const agentId = c.req.param('id');
  const listingId = c.req.param('listingId');

  // Enforce: only verified agents can be assigned to listings
  const agent = await c.env.DB.prepare(
    `SELECT id, verification_status, esvarbon_verified FROM re_agents WHERE id = ? AND tenant_id = ?`
  ).bind(agentId, tenantId).first<{ id: string; verification_status: string; esvarbon_verified: number }>();

  if (!agent) return c.json({ success: false, error: 'Agent not found' }, 404);

  if (agent.verification_status !== 'verified' || !agent.esvarbon_verified) {
    return c.json({
      success: false,
      error: 'Only ESVARBON-verified agents may be assigned to listings',
      data: { verification_status: agent.verification_status },
    }, 403);
  }

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
