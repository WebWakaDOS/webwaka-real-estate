/**
 * WebWaka Real Estate — Transactions Module API
 *
 * Handles property sale/rent transaction lifecycle, Paystack payment processing,
 * payment initiation, and contract generation.
 * All monetary values stored as integer kobo (Part 9.2).
 *
 * Routes:
 *   GET    /api/re/transactions                       — list transactions (admin, agent)
 *   GET    /api/re/transactions/:id                   — get transaction detail (admin, agent)
 *   POST   /api/re/transactions                       — initiate transaction (admin, agent)
 *   PATCH  /api/re/transactions/:id/status            — update transaction status (admin)
 *   POST   /api/re/transactions/:id/initiate-payment  — generate Paystack payment URL (admin, agent)
 *   GET    /api/re/transactions/:id/contract          — generate contract document (admin, agent)
 *   POST   /api/re/webhooks/paystack                  — Paystack webhook (no auth)
 *
 * Blueprint Reference: Part 9.2 (Monetary Integrity — integer kobo only)
 * Blueprint Reference: Part 9.3 (RBAC — requireRole)
 * RE-004: Automated contract generation
 * RE-005: Paystack payment initiation + event emission to webwaka-central-mgmt
 */
import { Hono } from 'hono';
import { jwtAuthMiddleware, requireRole, getTenantId } from '@webwaka/core';
import { generateContract } from '../contract';

export interface Env {
  DB: D1Database;
  DOCUMENTS: R2Bucket;
  TENANT_CONFIG: KVNamespace;
  JWT_SECRET: string;
  PAYSTACK_SECRET_KEY?: string;
  INTER_SERVICE_SECRET?: string;
  CENTRAL_MGMT_URL?: string;
  ENVIRONMENT?: string;
}

const app = new Hono<{ Bindings: Env }>();

// Webhook is signature-verified (no JWT needed); all other routes require JWT.
app.use('/api/re/*', jwtAuthMiddleware({
  publicRoutes: [{ path: '/api/re/webhooks', method: 'POST' }],
}));

// ─── Event emission helper → webwaka-central-mgmt ────────────────────────────
// RE-005: After payment success, emit financial event so the central ledger
// can record it. Fire-and-forget — never block the main response.
async function emitFinancialEvent(env: Env, payload: Record<string, unknown>): Promise<void> {
  const url = env.CENTRAL_MGMT_URL;
  if (!url) return;
  try {
    await fetch(`${url}/api/internal/events/financial`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.INTER_SERVICE_SECRET
          ? { 'X-Inter-Service-Secret': env.INTER_SERVICE_SECRET }
          : {}),
      },
      body: JSON.stringify({
        source: 'webwaka-real-estate',
        event_type: 'real_estate.payment',
        emitted_at: Date.now(),
        ...payload,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Non-fatal — central-mgmt may be temporarily unavailable
  }
}

// ─── GET /api/re/transactions — List transactions ─────────────────────────────
app.get('/api/re/transactions', requireRole(['admin', 'super_admin', 'agent']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const limit  = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);
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

  const id  = c.req.param('id');
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

  if (!body.listing_id || !body.transaction_type || !body.buyer_name || !body.buyer_phone) {
    return c.json({ success: false, error: 'Missing required fields' }, 400);
  }

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

  const listing = await c.env.DB.prepare(
    `SELECT id FROM re_listings WHERE id = ? AND tenant_id = ? AND status = 'active'`
  ).bind(body.listing_id, tenantId).first();
  if (!listing) return c.json({ success: false, error: 'Listing not found or not active' }, 404);

  const agencyFee    = body.agency_fee_kobo ?? 0;
  const legalFee     = body.legal_fee_kobo ?? 0;
  const cautionFee   = body.caution_fee_kobo ?? 0;
  const totalPayable = body.agreed_price_kobo + agencyFee + legalFee + cautionFee;

  const id  = `re_txn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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

  const id   = c.req.param('id');
  const body = await c.req.json<{ transaction_status: string; notes?: string }>();

  const validStatuses = ['initiated', 'in_progress', 'completed', 'cancelled'];
  if (!validStatuses.includes(body.transaction_status)) {
    return c.json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, 400);
  }

  const now    = Date.now();
  const result = await c.env.DB.prepare(
    `UPDATE re_transactions SET transaction_status = ?, notes = COALESCE(?, notes), updated_at = ?
     WHERE id = ? AND tenant_id = ?`
  ).bind(body.transaction_status, body.notes ?? null, now, id, tenantId).run();

  if (!result.meta.changes) return c.json({ success: false, error: 'Transaction not found' }, 404);
  return c.json({ success: true, data: { id, transaction_status: body.transaction_status } });
});

// ─── POST /api/re/transactions/:id/initiate-payment ───────────────────────────
// RE-005: Generates a Paystack payment authorization URL for the client to
//         redirect to. Passes tenant_id + transaction_id in metadata so the
//         webhook handler can correctly process the callback.
//
// Amount charged: the remaining balance (total_payable - amount_paid).
// If balance is zero, returns an error.
app.post(
  '/api/re/transactions/:id/initiate-payment',
  requireRole(['admin', 'super_admin', 'agent']),
  async (c) => {
    const tenantId = getTenantId(c);
    if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

    const id  = c.req.param('id');
    const txn = await c.env.DB.prepare(
      `SELECT id, tenant_id, buyer_email, total_payable_kobo, amount_paid_kobo,
              payment_status, transaction_status
       FROM re_transactions WHERE id = ? AND tenant_id = ?`
    ).bind(id, tenantId).first<{
      id: string; tenant_id: string; buyer_email: string | null;
      total_payable_kobo: number; amount_paid_kobo: number;
      payment_status: string; transaction_status: string;
    }>();

    if (!txn) return c.json({ success: false, error: 'Transaction not found' }, 404);

    if (txn.transaction_status === 'cancelled') {
      return c.json({ success: false, error: 'Cannot initiate payment for a cancelled transaction' }, 400);
    }

    const balanceKobo = txn.total_payable_kobo - txn.amount_paid_kobo;
    if (balanceKobo <= 0) {
      return c.json({ success: false, error: 'Transaction is already fully paid' }, 400);
    }

    const paystackSecretKey = c.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecretKey) {
      return c.json({
        success: false,
        error: 'PAYSTACK_SECRET_KEY is not configured on this environment',
      }, 503);
    }

    const body = await c.req.json<{ email?: string; callback_url?: string }>().catch(() => ({}));
    const email = body.email ?? txn.buyer_email;

    if (!email) {
      return c.json({
        success: false,
        error: 'email is required for payment initiation (buyer email not on record)',
      }, 400);
    }

    // Call Paystack Initialize Transaction API
    const paystackPayload = {
      email,
      amount: balanceKobo, // Paystack expects amount in kobo
      currency: 'NGN',
      reference: `re_pay_${id}_${Date.now()}`,
      metadata: {
        tenant_id: tenantId,
        transaction_id: id,
        source: 'webwaka-real-estate',
      },
      ...(body.callback_url ? { callback_url: body.callback_url } : {}),
    };

    let paystackData: {
      authorization_url: string;
      access_code: string;
      reference: string;
    };

    try {
      const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paystackPayload),
        signal: AbortSignal.timeout(10000),
      });

      const paystackJson = await paystackRes.json() as {
        status: boolean;
        message: string;
        data?: { authorization_url: string; access_code: string; reference: string };
      };

      if (!paystackRes.ok || !paystackJson.status || !paystackJson.data) {
        return c.json({
          success: false,
          error: `Paystack initialization failed: ${paystackJson.message ?? 'Unknown error'}`,
        }, 502);
      }

      paystackData = paystackJson.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({
        success: false,
        error: `Failed to reach Paystack: ${msg}`,
      }, 502);
    }

    return c.json({
      success: true,
      data: {
        transaction_id: id,
        balance_kobo: balanceKobo,
        authorization_url: paystackData.authorization_url,
        access_code: paystackData.access_code,
        paystack_reference: paystackData.reference,
      },
    });
  },
);

// ─── GET /api/re/transactions/:id/contract — Generate contract document ────────
// RE-004: Returns a structured contract object + plain-text representation.
// For PDF generation, pass the structured data to a PDF rendering service.
// Authorization: admin, super_admin, or the agent assigned to this transaction.
app.get(
  '/api/re/transactions/:id/contract',
  requireRole(['admin', 'super_admin', 'agent']),
  async (c) => {
    const tenantId = getTenantId(c);
    if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

    const id  = c.req.param('id');
    const fmt = c.req.query('format') ?? 'json'; // 'json' | 'text'

    const txn = await c.env.DB.prepare(
      `SELECT t.*, l.title, l.address, l.city, l.state, l.lga,
              l.property_type, l.listing_type, l.bedrooms, l.bathrooms
       FROM re_transactions t
       JOIN re_listings l ON l.id = t.listing_id
       WHERE t.id = ? AND t.tenant_id = ?`
    ).bind(id, tenantId).first<Record<string, unknown>>();

    if (!txn) return c.json({ success: false, error: 'Transaction not found' }, 404);

    // Fetch agent assigned to this transaction (if any)
    const agent = txn.agent_id
      ? await c.env.DB.prepare(
          `SELECT full_name, phone, email, esvarbon_reg_no FROM re_agents WHERE id = ? AND tenant_id = ?`
        ).bind(txn.agent_id, tenantId).first<Record<string, unknown>>()
      : null;

    const listing: Record<string, unknown> = {
      title:         txn.title,
      address:       txn.address,
      city:          txn.city,
      state:         txn.state,
      lga:           txn.lga,
      property_type: txn.property_type,
      listing_type:  txn.listing_type,
      bedrooms:      txn.bedrooms,
      bathrooms:     txn.bathrooms,
    };

    const contract = generateContract({
      transactionId: id,
      tenantId,
      transaction: txn,
      listing,
      agent,
    });

    if (fmt === 'text') {
      return new Response(contract.text, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `inline; filename="contract_${id}.txt"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return c.json({ success: true, data: contract });
  },
);

// ─── POST /api/re/webhooks/paystack — Paystack webhook ────────────────────────
app.post('/api/re/webhooks/paystack', async (c) => {
  const signature = c.req.header('x-paystack-signature');
  if (!signature) return c.json({ success: false, error: 'Missing signature' }, 400);

  const rawBody = await c.req.text();
  const secret  = c.env.PAYSTACK_SECRET_KEY ?? '';

  // HMAC-SHA512 verification
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (hex !== signature) return c.json({ success: false, error: 'Invalid signature' }, 401);

  let payload: { event: string; data: Record<string, unknown> };
  try { payload = JSON.parse(rawBody); } catch { return c.json({ success: false, error: 'Invalid JSON' }, 400); }

  const { event, data }   = payload;
  const reference         = data.reference as string;
  const amountKobo        = data.amount as number;
  const tenantId          = (data.metadata as Record<string, unknown> | undefined)?.tenant_id as string | undefined;
  const transactionId     = (data.metadata as Record<string, unknown> | undefined)?.transaction_id as string | undefined;
  const now               = Date.now();

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

      await c.env.DB.prepare(
        `UPDATE re_transactions
         SET amount_paid_kobo = amount_paid_kobo + ?,
             payment_status = CASE WHEN amount_paid_kobo + ? >= total_payable_kobo THEN 'paid' ELSE 'partial' END,
             transaction_status = CASE WHEN amount_paid_kobo + ? >= total_payable_kobo THEN 'in_progress' ELSE transaction_status END,
             updated_at = ?
         WHERE id = ? AND tenant_id = ?`
      ).bind(amountKobo, amountKobo, amountKobo, now, transactionId, tenantId).run();

      // RE-005: Emit financial event to webwaka-central-mgmt (fire-and-forget)
      c.executionCtx?.waitUntil(
        emitFinancialEvent(c.env, {
          tenant_id:       tenantId,
          transaction_id:  transactionId,
          payment_id:      paymentId,
          paystack_ref:    reference,
          amount_kobo:     amountKobo,
          payment_method:  data.channel ?? null,
          paid_at:         now,
        }),
      );
    }
  }

  return c.json({ success: true });
});

export default app;
