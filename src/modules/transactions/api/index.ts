/**
 * WebWaka Real Estate — Transactions Module API
 *
 * Handles property sale/rent transaction lifecycle and Paystack payment processing.
 * All monetary values stored as integer kobo (Part 9.2).
 *
 * Routes:
 *   GET    /api/re/transactions            — list transactions (admin, agent)
 *   GET    /api/re/transactions/:id        — get transaction detail (admin, agent)
 *   POST   /api/re/transactions            — initiate transaction (admin, agent)
 *   PATCH  /api/re/transactions/:id/status — update transaction status (admin)
 *   POST   /api/re/webhooks/paystack       — Paystack webhook (no auth)
 *
 * Blueprint Reference: Part 9.2 (Monetary Integrity — integer kobo only)
 * Blueprint Reference: Part 9.3 (RBAC — requireRole)
 */
import { Hono } from 'hono';
import { jwtAuthMiddleware, requireRole, getTenantId } from '@webwaka/core';

export interface Env {
  DB: D1Database;
  DOCUMENTS: R2Bucket;
  TENANT_CONFIG: KVNamespace;
  JWT_SECRET: string;
  PAYSTACK_SECRET_KEY?: string;
  ENVIRONMENT?: string;
}

const app = new Hono<{ Bindings: Env }>();

// Webhook route is public (Paystack signature-verified)
app.use('/api/re/transactions*', jwtAuthMiddleware({ publicRoutes: [] }));

// ─── GET /api/re/transactions — List transactions ─────────────────────────────
app.get('/api/re/transactions', requireRole(['admin', 'super_admin', 'agent']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);
  const offset = parseInt(c.req.query('offset') ?? '0');
  const status = c.req.query('status');

  let query = `SELECT t.*, l.title as listing_title, l.address as listing_address
               FROM re_transactions t
               JOIN re_listings l ON l.id = t.listing_id
               WHERE t.tenant_id = ?`;
  const params: (string | number)[] = [tenantId];

  if (status) { query += ' AND t.transaction_status = ?'; params.push(status); }
  query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const results = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ success: true, data: results.results, meta: { limit, offset } });
});

// ─── GET /api/re/transactions/:id — Get transaction detail ────────────────────
app.get('/api/re/transactions/:id', requireRole(['admin', 'super_admin', 'agent']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const id = c.req.param('id');
  const txn = await c.env.DB.prepare(
    `SELECT t.*, l.title as listing_title, l.address as listing_address, l.price_kobo as listing_price_kobo
     FROM re_transactions t
     JOIN re_listings l ON l.id = t.listing_id
     WHERE t.id = ? AND t.tenant_id = ?`
  ).bind(id, tenantId).first();

  if (!txn) return c.json({ success: false, error: 'Transaction not found' }, 404);

  const payments = await c.env.DB.prepare(
    `SELECT id, paystack_reference, amount_kobo, payment_method, status, created_at
     FROM re_payments WHERE transaction_id = ? ORDER BY created_at DESC`
  ).bind(id).all();

  return c.json({ success: true, data: { ...txn, payments: payments.results } });
});

// ─── POST /api/re/transactions — Initiate transaction ─────────────────────────
app.post('/api/re/transactions', requireRole(['admin', 'super_admin', 'agent']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const body = await c.req.json<{
    listing_id: string;
    transaction_type: string;
    buyer_name: string;
    buyer_phone: string;
    buyer_email?: string;
    buyer_id?: string;
    agent_id?: string;
    agreed_price_kobo: number;
    agency_fee_kobo?: number;
    legal_fee_kobo?: number;
    caution_fee_kobo?: number;
    rent_start_date?: number;
    rent_end_date?: number;
    notes?: string;
  }>();

  // Validate required fields
  if (!body.listing_id || !body.transaction_type || !body.buyer_name || !body.buyer_phone) {
    return c.json({ success: false, error: 'Missing required fields' }, 400);
  }

  // Monetary integrity: all kobo values must be positive integers
  const koboFields: Array<[string, number | undefined]> = [
    ['agreed_price_kobo', body.agreed_price_kobo],
    ['agency_fee_kobo', body.agency_fee_kobo],
    ['legal_fee_kobo', body.legal_fee_kobo],
    ['caution_fee_kobo', body.caution_fee_kobo],
  ];
  for (const [field, value] of koboFields) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      return c.json({ success: false, error: `${field} must be a non-negative integer (kobo)` }, 400);
    }
  }
  if (!Number.isInteger(body.agreed_price_kobo) || body.agreed_price_kobo <= 0) {
    return c.json({ success: false, error: 'agreed_price_kobo must be a positive integer (kobo)' }, 400);
  }

  // Verify listing exists and belongs to tenant
  const listing = await c.env.DB.prepare(
    `SELECT id FROM re_listings WHERE id = ? AND tenant_id = ? AND status = 'active'`
  ).bind(body.listing_id, tenantId).first();
  if (!listing) return c.json({ success: false, error: 'Listing not found or not active' }, 404);

  const agencyFee = body.agency_fee_kobo ?? 0;
  const legalFee = body.legal_fee_kobo ?? 0;
  const cautionFee = body.caution_fee_kobo ?? 0;
  const totalPayable = body.agreed_price_kobo + agencyFee + legalFee + cautionFee;

  const id = `re_txn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO re_transactions
       (id, tenant_id, listing_id, transaction_type, buyer_id, buyer_name, buyer_phone, buyer_email,
        agent_id, agreed_price_kobo, agency_fee_kobo, legal_fee_kobo, caution_fee_kobo,
        total_payable_kobo, amount_paid_kobo, payment_status, transaction_status,
        rent_start_date, rent_end_date, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', 'initiated', ?, ?, ?, ?, ?)`
  ).bind(
    id, tenantId, body.listing_id, body.transaction_type,
    body.buyer_id ?? null, body.buyer_name, body.buyer_phone, body.buyer_email ?? null,
    body.agent_id ?? null,
    body.agreed_price_kobo, agencyFee, legalFee, cautionFee, totalPayable,
    body.rent_start_date ?? null, body.rent_end_date ?? null, body.notes ?? null,
    now, now,
  ).run();

  return c.json({
    success: true,
    data: { id, total_payable_kobo: totalPayable, payment_status: 'pending', transaction_status: 'initiated' },
  }, 201);
});

// ─── PATCH /api/re/transactions/:id/status — Update status ────────────────────
app.patch('/api/re/transactions/:id/status', requireRole(['admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const id = c.req.param('id');
  const body = await c.req.json<{ transaction_status: string; notes?: string }>();

  const validStatuses = ['initiated', 'in_progress', 'completed', 'cancelled'];
  if (!validStatuses.includes(body.transaction_status)) {
    return c.json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, 400);
  }

  const now = Date.now();
  const result = await c.env.DB.prepare(
    `UPDATE re_transactions SET transaction_status = ?, notes = COALESCE(?, notes), updated_at = ?
     WHERE id = ? AND tenant_id = ?`
  ).bind(body.transaction_status, body.notes ?? null, now, id, tenantId).run();

  if (!result.meta.changes) return c.json({ success: false, error: 'Transaction not found' }, 404);
  return c.json({ success: true, data: { id, transaction_status: body.transaction_status } });
});

// ─── POST /api/re/webhooks/paystack — Paystack webhook ────────────────────────
app.post('/api/re/webhooks/paystack', async (c) => {
  const signature = c.req.header('x-paystack-signature');
  if (!signature) return c.json({ success: false, error: 'Missing signature' }, 400);

  const rawBody = await c.req.text();
  const secret = c.env.PAYSTACK_SECRET_KEY ?? '';

  // HMAC-SHA512 verification
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (hex !== signature) return c.json({ success: false, error: 'Invalid signature' }, 401);

  let payload: { event: string; data: Record<string, unknown> };
  try { payload = JSON.parse(rawBody); } catch { return c.json({ success: false, error: 'Invalid JSON' }, 400); }

  const { event, data } = payload;
  const reference = data.reference as string;
  const amountKobo = data.amount as number; // Paystack sends amount in kobo
  const tenantId = (data.metadata as Record<string, unknown> | undefined)?.tenant_id as string | undefined;
  const transactionId = (data.metadata as Record<string, unknown> | undefined)?.transaction_id as string | undefined;
  const now = Date.now();

  if (event === 'charge.success' && reference && tenantId && transactionId) {
    // Idempotency check
    const existing = await c.env.DB.prepare(
      `SELECT id FROM re_payments WHERE paystack_reference = ? AND tenant_id = ?`
    ).bind(reference, tenantId).first();

    if (!existing) {
      const paymentId = `re_pay_${now}_${Math.random().toString(36).slice(2, 9)}`;
      await c.env.DB.prepare(
        `INSERT INTO re_payments (id, tenant_id, transaction_id, paystack_reference, amount_kobo, payment_method, status, paystack_event_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?, ?)`
      ).bind(paymentId, tenantId, transactionId, reference, amountKobo, data.channel ?? null, rawBody, now, now).run();

      // Update transaction amount_paid and payment_status
      await c.env.DB.prepare(
        `UPDATE re_transactions
         SET amount_paid_kobo = amount_paid_kobo + ?,
             payment_status = CASE WHEN amount_paid_kobo + ? >= total_payable_kobo THEN 'paid' ELSE 'partial' END,
             transaction_status = CASE WHEN amount_paid_kobo + ? >= total_payable_kobo THEN 'in_progress' ELSE transaction_status END,
             updated_at = ?
         WHERE id = ? AND tenant_id = ?`
      ).bind(amountKobo, amountKobo, amountKobo, now, transactionId, tenantId).run();
    }
  }

  return c.json({ success: true });
});

export default app;
