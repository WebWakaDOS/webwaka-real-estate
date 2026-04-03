/**
 * ESVARBON Verification Service
 *
 * Attempts automated verification via the ESVARBON API.
 * If the API is unavailable or not configured, returns a signal
 * to fall back to the manual document review flow.
 *
 * Nigeria-First: ESVARBON does not currently publish a public REST API.
 * When the ESVARBON_API_URL env variable is set, we attempt the call.
 * Otherwise we degrade gracefully to manual_review.
 *
 * Blueprint Reference: Part 9.2 (Nigeria-First, Africa-Ready)
 * T-RES-01
 */

export type EsvarbonResult =
  | { status: 'verified'; raw: string }
  | { status: 'not_found'; raw: string }
  | { status: 'unavailable'; reason: string };

export interface EsvarbonEnv {
  ESVARBON_API_URL?: string;
  ESVARBON_API_KEY?: string;
}

/**
 * Attempt to verify a registration number against the ESVARBON API.
 *
 * Returns:
 *  - `verified`    — number exists and is active in the register
 *  - `not_found`   — API responded but number not found / inactive
 *  - `unavailable` — API not configured or returned an error (→ manual fallback)
 */
export async function verifyEsvarbonNumber(
  regNo: string,
  env: EsvarbonEnv,
): Promise<EsvarbonResult> {
  const apiUrl = env.ESVARBON_API_URL;
  const apiKey = env.ESVARBON_API_KEY;

  if (!apiUrl) {
    return { status: 'unavailable', reason: 'ESVARBON_API_URL not configured — manual review required' };
  }

  try {
    const url = new URL(`/verify`, apiUrl);
    url.searchParams.set('reg_no', regNo);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      // Cloudflare Workers: fetch timeout via AbortSignal
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return {
        status: 'unavailable',
        reason: `ESVARBON API returned HTTP ${res.status} — manual review required`,
      };
    }

    const body = await res.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return { status: 'unavailable', reason: 'ESVARBON API returned non-JSON — manual review required' };
    }

    // Expected shape: { found: boolean, active: boolean, ... }
    // Adapt to actual ESVARBON API shape when available.
    const found = Boolean(parsed['found'] ?? parsed['exists'] ?? parsed['status'] === 'active');
    const active = Boolean(parsed['active'] ?? parsed['status'] === 'active');

    if (found && active) {
      return { status: 'verified', raw: body };
    }
    return { status: 'not_found', raw: body };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'unavailable', reason: `ESVARBON API request failed: ${msg} — manual review required` };
  }
}
