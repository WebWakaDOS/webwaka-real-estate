/**
 * Tests for ESVARBON Verification Service
 * T-RES-01: automated and manual verification paths
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyEsvarbonNumber } from './esvarbon';

describe('verifyEsvarbonNumber', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Automated path ──────────────────────────────────────────────────────────

  it('returns unavailable when ESVARBON_API_URL is not configured', async () => {
    const result = await verifyEsvarbonNumber('ESV/2024/001', {});
    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('ESVARBON_API_URL not configured');
  });

  it('returns verified when API confirms the registration number', async () => {
    const mockResponse = { found: true, active: true, name: 'John Doe', reg_no: 'ESV/2024/001' };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify(mockResponse),
    });

    const result = await verifyEsvarbonNumber('ESV/2024/001', {
      ESVARBON_API_URL: 'https://esvarbon.api.test',
      ESVARBON_API_KEY: 'test-key',
    });

    expect(result.status).toBe('verified');
    expect('raw' in result && result.raw).toContain('John Doe');
  });

  it('returns verified for API shape with status=active', async () => {
    const mockResponse = { status: 'active', reg_no: 'ESV/2024/002' };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify(mockResponse),
    });

    const result = await verifyEsvarbonNumber('ESV/2024/002', {
      ESVARBON_API_URL: 'https://esvarbon.api.test',
    });

    expect(result.status).toBe('verified');
  });

  it('returns not_found when API says number is not in the register', async () => {
    const mockResponse = { found: false, active: false };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify(mockResponse),
    });

    const result = await verifyEsvarbonNumber('ESV/FAKE/999', {
      ESVARBON_API_URL: 'https://esvarbon.api.test',
    });

    expect(result.status).toBe('not_found');
  });

  it('returns not_found when found=true but active=false', async () => {
    const mockResponse = { found: true, active: false };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify(mockResponse),
    });

    const result = await verifyEsvarbonNumber('ESV/EXPIRED/001', {
      ESVARBON_API_URL: 'https://esvarbon.api.test',
    });

    expect(result.status).toBe('not_found');
  });

  // ── Manual fallback path ────────────────────────────────────────────────────

  it('returns unavailable (manual fallback) when API returns non-200', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 503,
    });

    const result = await verifyEsvarbonNumber('ESV/2024/001', {
      ESVARBON_API_URL: 'https://esvarbon.api.test',
    });

    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('HTTP 503');
  });

  it('returns unavailable (manual fallback) when API returns non-JSON', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => '<html>Service Unavailable</html>',
    });

    const result = await verifyEsvarbonNumber('ESV/2024/001', {
      ESVARBON_API_URL: 'https://esvarbon.api.test',
    });

    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('non-JSON');
  });

  it('returns unavailable (manual fallback) when fetch throws (network error)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fetch failed'));

    const result = await verifyEsvarbonNumber('ESV/2024/001', {
      ESVARBON_API_URL: 'https://esvarbon.api.test',
    });

    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('fetch failed');
  });

  it('includes Authorization header when API key is provided', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ found: true, active: true }),
    });

    await verifyEsvarbonNumber('ESV/2024/001', {
      ESVARBON_API_URL: 'https://esvarbon.api.test',
      ESVARBON_API_KEY: 'secret-key',
    });

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer secret-key');
  });

  it('does not include Authorization header when API key is absent', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ found: true, active: true }),
    });

    await verifyEsvarbonNumber('ESV/2024/001', {
      ESVARBON_API_URL: 'https://esvarbon.api.test',
    });

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });
});
