/**
 * Tenancy Management Module — WebWaka Real Estate Suite
 *
 * Endpoints:
 *   GET    /api/tenancy             — list tenancies
 *   POST   /api/tenancy             — create tenancy record
 *   PATCH  /api/tenancy/:id         — update tenancy
 *   DELETE /api/tenancy/:id         — terminate tenancy
 *   POST   /api/tenancy/:id/payment — record rent payment via Paystack
 *
 * Security:
 *   - tenantId ALWAYS from JWT context — NEVER from headers/body
 *   - All D1 queries include WHERE tenant_id = ? for tenant isolation
 */

import { Hono } from 'hono';
import { requireRole } from '../../middleware/auth';
import { initializePayment, generatePaymentReference } from '../../core/paystack';
import type { Bindings } from '../../core/types';

export const tenancyMgmtRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/tenancy — list tenancies
tenancyMgmtRouter.get('/', requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'PROPERTY_AGENT', 'VIEWER']), async (c) => {
  const tenantId = c.get('tenantId');
  const status = c.req.query('status');

  let query = 'SELECT * FROM tenancies WHERE tenant_id = ?';
  const params: (string | number)[] = [tenantId];

  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC';

  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ data: results });
});

// POST /api/tenancy — create tenancy
tenancyMgmtRouter.post('/', requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'PROPERTY_AGENT']), async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json<{
    propertyId: string;
    tenantName: string;
    tenantPhone: string;
    tenantEmail?: string;
    startDate: string;
    endDate: string;
    rentKobo: number;
    depositKobo: number;
  }>();

  if (!body.propertyId || !body.tenantName || !body.tenantPhone || !body.startDate || !body.endDate || !body.rentKobo || !body.depositKobo) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  if (!Number.isInteger(body.rentKobo) || body.rentKobo <= 0) {
    return c.json({ error: 'rentKobo must be a positive integer (kobo amount)' }, 400);
  }

  if (!Number.isInteger(body.depositKobo) || body.depositKobo <= 0) {
    return c.json({ error: 'depositKobo must be a positive integer (kobo amount)' }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO tenancies (id, tenant_id, property_id, tenant_name, tenant_phone, tenant_email, start_date, end_date, rent_kobo, deposit_kobo, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).bind(id, tenantId, body.propertyId, body.tenantName, body.tenantPhone, body.tenantEmail ?? null, body.startDate, body.endDate, body.rentKobo, body.depositKobo, now, now).run();

  return c.json({ data: { id, tenantId, ...body, status: 'active', createdAt: now } }, 201);
});

// PATCH /api/tenancy/:id — update tenancy
tenancyMgmtRouter.patch('/:id', requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'PROPERTY_AGENT']), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const body = await c.req.json<Partial<{ status: string; endDate: string; rentKobo: number }>>();

  const { results } = await c.env.DB.prepare(
    'SELECT id FROM tenancies WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).all();

  if (!results.length) return c.json({ error: 'Tenancy not found' }, 404);

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    'UPDATE tenancies SET status = COALESCE(?, status), end_date = COALESCE(?, end_date), rent_kobo = COALESCE(?, rent_kobo), updated_at = ? WHERE id = ? AND tenant_id = ?'
  ).bind(body.status ?? null, body.endDate ?? null, body.rentKobo ?? null, now, id, tenantId).run();

  return c.json({ data: { id, updatedAt: now } });
});

// DELETE /api/tenancy/:id — terminate tenancy (TENANT_ADMIN only)
tenancyMgmtRouter.delete('/:id', requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  const { results } = await c.env.DB.prepare(
    'SELECT id FROM tenancies WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).all();

  if (!results.length) return c.json({ error: 'Tenancy not found' }, 404);

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    'UPDATE tenancies SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?'
  ).bind('terminated', now, id, tenantId).run();

  return c.json({ data: { id, status: 'terminated', updatedAt: now } });
});

// POST /api/tenancy/:id/payment — initialize Paystack rent payment
tenancyMgmtRouter.post('/:id/payment', requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'PROPERTY_AGENT']), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const body = await c.req.json<{ emailAddress: string; callbackUrl: string }>();

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM tenancies WHERE id = ? AND tenant_id = ? AND status = ?'
  ).bind(id, tenantId, 'active').all();

  if (!results.length) return c.json({ error: 'Active tenancy not found' }, 404);

  const tenancy = results[0] as { rent_kobo: number };
  const reference = generatePaymentReference(tenantId);

  const paystackResponse = await initializePayment(c.env.PAYSTACK_SECRET_KEY, {
    emailAddress: body.emailAddress,
    amountKobo: tenancy.rent_kobo, // Always kobo
    reference,
    callbackUrl: body.callbackUrl,
    metadata: { tenancyId: id, tenantId, type: 'rent_payment' },
    channels: ['card', 'bank', 'ussd', 'bank_transfer'],
  });

  return c.json({ data: paystackResponse.data });
});
