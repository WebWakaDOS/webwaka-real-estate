/**
 * Tests for Agent Verification API endpoints
 * T-RES-01: ESVARBON automated & manual verification paths, listing publication gate
 *
 * Uses in-process mocks for Cloudflare bindings (D1, R2, KV) and @webwaka/core.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// ─── @webwaka/core must be mocked BEFORE any app import ──────────────────────
vi.mock('@webwaka/core', () => ({
  jwtAuthMiddleware: () => async (c: any, next: () => Promise<void>) => {
    c.set('user', { sub: 'user_admin_01', role: 'admin', tenant_id: 'tenant_test' });
    await next();
  },
  requireRole: (_roles: string[]) => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
  getTenantId: (_c: any) => 'tenant_test',
}));

// Import app AFTER the mock is registered
import app from './index';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

type MockDb = {
  prepare: ReturnType<typeof vi.fn>;
};

function makeDb(agentRow: Record<string, unknown> | null = null): MockDb {
  const bindable = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(agentRow),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
  };
  return { prepare: vi.fn().mockReturnValue(bindable) };
}

function makeR2() {
  return { put: vi.fn().mockResolvedValue(undefined) };
}

function makeKV() {
  return { get: vi.fn().mockResolvedValue(null) };
}

function makeEnv(dbRows: Record<string, unknown> | null = null, extra: Record<string, unknown> = {}) {
  return {
    DB: makeDb(dbRows),
    DOCUMENTS: makeR2(),
    TENANT_CONFIG: makeKV(),
    JWT_SECRET: 'test-secret',
    ENVIRONMENT: 'test',
    ...extra,
  };
}

// ─── POST /api/re/agents/:id/verify — automated path ─────────────────────────

describe('POST /api/re/agents/:id/verify', () => {
  afterEach(() => vi.restoreAllMocks());

  it('marks agent verified when ESVARBON API confirms the number', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ found: true, active: true }),
    }));

    const env = makeEnv(
      { id: 'agent_01', esvarbon_reg_no: 'ESV/2024/001', verification_status: 'unverified' },
      { ESVARBON_API_URL: 'https://esvarbon.api.test' },
    );

    const req = new Request('http://localhost/api/re/agents/agent_01/verify', { method: 'POST' });
    const res = await app.fetch(req, env, {} as ExecutionContext);
    const body = await res.json() as { success: boolean; data: { verification_status: string; method: string } };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.verification_status).toBe('verified');
    expect(body.data.method).toBe('esvarbon_api');

    vi.unstubAllGlobals();
  });

  it('rejects agent when ESVARBON API returns not_found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ found: false, active: false }),
    }));

    const env = makeEnv(
      { id: 'agent_02', esvarbon_reg_no: 'ESV/FAKE', verification_status: 'unverified' },
      { ESVARBON_API_URL: 'https://esvarbon.api.test' },
    );

    const req = new Request('http://localhost/api/re/agents/agent_02/verify', { method: 'POST' });
    const res = await app.fetch(req, env, {} as ExecutionContext);
    const body = await res.json() as { data: { verification_status: string } };

    expect(res.status).toBe(422);
    expect(body.data.verification_status).toBe('rejected');

    vi.unstubAllGlobals();
  });

  it('moves agent to manual_review when ESVARBON API is not configured', async () => {
    const env = makeEnv({ id: 'agent_03', esvarbon_reg_no: 'ESV/2024/003', verification_status: 'unverified' });

    const req = new Request('http://localhost/api/re/agents/agent_03/verify', { method: 'POST' });
    const res = await app.fetch(req, env, {} as ExecutionContext);
    const body = await res.json() as { data: { verification_status: string; message: string } };

    expect(res.status).toBe(200);
    expect(body.data.verification_status).toBe('manual_review');
    expect(body.data.message).toContain('manual review');
  });

  it('moves agent to manual_review when ESVARBON API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')));

    const env = makeEnv(
      { id: 'agent_03b', esvarbon_reg_no: 'ESV/2024/003', verification_status: 'unverified' },
      { ESVARBON_API_URL: 'https://esvarbon.api.test' },
    );

    const req = new Request('http://localhost/api/re/agents/agent_03b/verify', { method: 'POST' });
    const res = await app.fetch(req, env, {} as ExecutionContext);
    const body = await res.json() as { data: { verification_status: string } };

    expect(res.status).toBe(200);
    expect(body.data.verification_status).toBe('manual_review');

    vi.unstubAllGlobals();
  });

  it('returns 400 if agent has no esvarbon_reg_no', async () => {
    const env = makeEnv({ id: 'agent_04', esvarbon_reg_no: null, verification_status: 'unverified' });

    const req = new Request('http://localhost/api/re/agents/agent_04/verify', { method: 'POST' });
    const res = await app.fetch(req, env, {} as ExecutionContext);
    const body = await res.json() as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toContain('no ESVARBON registration number');
  });

  it('returns 400 if agent is already verified', async () => {
    const env = makeEnv({ id: 'agent_04b', esvarbon_reg_no: 'ESV/2024/001', verification_status: 'verified' });

    const req = new Request('http://localhost/api/re/agents/agent_04b/verify', { method: 'POST' });
    const res = await app.fetch(req, env, {} as ExecutionContext);

    expect(res.status).toBe(400);
  });

  it('returns 404 if agent not found', async () => {
    const env = makeEnv(null);

    const req = new Request('http://localhost/api/re/agents/agent_missing/verify', { method: 'POST' });
    const res = await app.fetch(req, env, {} as ExecutionContext);

    expect(res.status).toBe(404);
  });
});

// ─── POST /api/re/agents/:id/verification/approve — manual approval ───────────

describe('POST /api/re/agents/:id/verification/approve', () => {
  it('approves an agent in manual_review status', async () => {
    const env = makeEnv({ id: 'agent_05', verification_status: 'manual_review' });

    const req = new Request('http://localhost/api/re/agents/agent_05/verification/approve', { method: 'POST' });
    const res = await app.fetch(req, env, {} as ExecutionContext);
    const body = await res.json() as { data: { verification_status: string; method: string } };

    expect(res.status).toBe(200);
    expect(body.data.verification_status).toBe('verified');
    expect(body.data.method).toBe('manual');
  });

  it('approves an agent in pending_docs status', async () => {
    const env = makeEnv({ id: 'agent_05b', verification_status: 'pending_docs' });

    const req = new Request('http://localhost/api/re/agents/agent_05b/verification/approve', { method: 'POST' });
    const res = await app.fetch(req, env, {} as ExecutionContext);
    const body = await res.json() as { data: { verification_status: string } };

    expect(res.status).toBe(200);
    expect(body.data.verification_status).toBe('verified');
  });

  it('approves a previously rejected agent (admin override)', async () => {
    const env = makeEnv({ id: 'agent_07', verification_status: 'rejected' });

    const req = new Request('http://localhost/api/re/agents/agent_07/verification/approve', { method: 'POST' });
    const res = await app.fetch(req, env, {} as ExecutionContext);
    const body = await res.json() as { data: { verification_status: string } };

    expect(res.status).toBe(200);
    expect(body.data.verification_status).toBe('verified');
  });

  it('returns 400 if agent is already verified', async () => {
    const env = makeEnv({ id: 'agent_06', verification_status: 'verified' });

    const req = new Request('http://localhost/api/re/agents/agent_06/verification/approve', { method: 'POST' });
    const res = await app.fetch(req, env, {} as ExecutionContext);

    expect(res.status).toBe(400);
  });

  it('returns 404 if agent not found', async () => {
    const env = makeEnv(null);

    const req = new Request('http://localhost/api/re/agents/agent_missing/verification/approve', { method: 'POST' });
    const res = await app.fetch(req, env, {} as ExecutionContext);

    expect(res.status).toBe(404);
  });
});

// ─── POST /api/re/agents/:id/verification/reject ──────────────────────────────

describe('POST /api/re/agents/:id/verification/reject', () => {
  it('rejects an agent with a custom reason', async () => {
    const env = makeEnv({ id: 'agent_08', verification_status: 'manual_review' });

    const req = new Request('http://localhost/api/re/agents/agent_08/verification/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Document appears fraudulent' }),
    });
    const res = await app.fetch(req, env, {} as ExecutionContext);
    const body = await res.json() as { data: { verification_status: string; reason: string } };

    expect(res.status).toBe(200);
    expect(body.data.verification_status).toBe('rejected');
    expect(body.data.reason).toBe('Document appears fraudulent');
  });

  it('rejects with a default reason when none provided', async () => {
    const env = makeEnv({ id: 'agent_09', verification_status: 'pending_docs' });

    const req = new Request('http://localhost/api/re/agents/agent_09/verification/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await app.fetch(req, env, {} as ExecutionContext);
    const body = await res.json() as { data: { reason: string } };

    expect(res.status).toBe(200);
    expect(body.data.reason).toBe('Rejected by admin');
  });

  it('returns 404 if agent not found', async () => {
    const env = makeEnv(null);

    const req = new Request('http://localhost/api/re/agents/agent_missing/verification/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'test' }),
    });
    const res = await app.fetch(req, env, {} as ExecutionContext);

    expect(res.status).toBe(404);
  });
});

// ─── Verified-agent listing assignment gate ───────────────────────────────────

describe('POST /api/re/agents/:id/listings/:listingId — assignment gate', () => {
  it('blocks assigning an unverified agent to a listing', async () => {
    const env = makeEnv({ id: 'agent_10', verification_status: 'unverified', esvarbon_verified: 0 });

    const req = new Request('http://localhost/api/re/agents/agent_10/listings/listing_01', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'primary' }),
    });

    const res = await app.fetch(req, env, {} as ExecutionContext);
    const body = await res.json() as { error: string };

    expect(res.status).toBe(403);
    expect(body.error).toContain('ESVARBON-verified');
  });

  it('blocks assigning an agent with pending_docs status', async () => {
    const env = makeEnv({ id: 'agent_10b', verification_status: 'pending_docs', esvarbon_verified: 0 });

    const req = new Request('http://localhost/api/re/agents/agent_10b/listings/listing_01', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'primary' }),
    });

    const res = await app.fetch(req, env, {} as ExecutionContext);

    expect(res.status).toBe(403);
  });

  it('allows assigning a verified agent to a listing', async () => {
    const env = makeEnv({ id: 'agent_11', verification_status: 'verified', esvarbon_verified: 1 });

    const req = new Request('http://localhost/api/re/agents/agent_11/listings/listing_02', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'primary' }),
    });

    const res = await app.fetch(req, env, {} as ExecutionContext);
    const body = await res.json() as { success: boolean; data: { agent_id: string } };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.agent_id).toBe('agent_11');
  });
});

// ─── Reject clears stale audit fields ────────────────────────────────────────

describe('POST /api/re/agents/:id/verification/reject — audit field clearing', () => {
  it('clears verified_at and verified_by when rejecting a previously verified agent', async () => {
    const runMock = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const bindMock = vi.fn().mockReturnThis();
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: bindMock,
        first: vi.fn().mockResolvedValue({ id: 'agent_v1', verification_status: 'verified' }),
        run: runMock,
      }),
    };

    const env = makeEnv(null, { DB: db });
    const req = new Request('http://localhost/api/re/agents/agent_v1/verification/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Revoked — licence expired' }),
    });

    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(200);

    // Verify the UPDATE SQL included NULL-clearing of audit fields
    const sqlCall = (db.prepare as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('verified_at = NULL'),
    );
    expect(sqlCall).toBeDefined();
  });
});

// ─── Rejected agent document re-upload transitions to pending_docs ─────────────

describe('Document upload — rejected agent re-submission', () => {
  it('transitions a rejected agent to pending_docs when they upload a corrective document', async () => {
    const runMock = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: 'agent_r1', verification_status: 'rejected' }),
        run: runMock,
      }),
    };
    const r2 = { put: vi.fn().mockResolvedValue(undefined) };

    const formData = new FormData();
    const fileContent = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes
    formData.append('document', new File([fileContent], 'cert.png', { type: 'image/png' }));

    const env = makeEnv(null, { DB: db, DOCUMENTS: r2 });
    const req = new Request('http://localhost/api/re/agents/agent_r1/documents', {
      method: 'POST',
      body: formData,
    });

    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(200);

    // Verify the SQL includes the CASE covering 'rejected'
    const sqlCall = (db.prepare as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes("'rejected'"),
    );
    expect(sqlCall).toBeDefined();

    // R2 put was called
    expect(r2.put).toHaveBeenCalledOnce();
  });
});

// ─── GET /api/re/agents/pending-verification ──────────────────────────────────

describe('GET /api/re/agents/pending-verification', () => {
  it('returns agents in pending_docs or manual_review status', async () => {
    const env = makeEnv();
    const pendingAgents = [
      { id: 'agent_p1', verification_status: 'pending_docs', full_name: 'Alice' },
      { id: 'agent_p2', verification_status: 'manual_review', full_name: 'Bob' },
    ];
    (env.DB as any).prepare.mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: pendingAgents }),
      run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
    });

    const req = new Request('http://localhost/api/re/agents/pending-verification');
    const res = await app.fetch(req, env, {} as ExecutionContext);
    const body = await res.json() as { success: boolean; data: unknown[] };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });
});
