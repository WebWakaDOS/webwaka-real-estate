/**
 * WebWaka Real Estate — Listings Module API
 *
 * Handles property listing CRUD, search, image management, and valuation.
 * All monetary values stored as integer kobo.
 * All routes scoped by tenant_id from JWT.
 *
 * Routes:
 *   GET    /api/re/listings            — search/list listings (public)
 *   GET    /api/re/listings/:id        — get listing detail (public)
 *   GET    /api/re/listings/:id/valuation — CMA-based property valuation (auth)
 *   POST   /api/re/listings            — create listing (agent, admin)
 *   PATCH  /api/re/listings/:id        — update listing (agent, admin)
 *   DELETE /api/re/listings/:id        — delete listing (admin)
 *   POST   /api/re/listings/:id/images — upload listing image (agent, admin)
 *   DELETE /api/re/listings/:id/images/:imageId — delete image (agent, admin)
 *
 * Blueprint Reference: Part 9.2 (Multi-Tenancy, Monetary Integrity)
 * Blueprint Reference: Part 9.3 (RBAC — requireRole)
 * T-RES-01: Unverified agents blocked from publishing; verified badge in detail.
 * RE-001: Advanced search filters (bedrooms, bathrooms, amenities, size, lga, q)
 * RE-002: Proximity search (lat/lng/radius_km with Haversine filter)
 * RE-006: Property valuation endpoint (CMA)
 * RE-007: Locale-aware price display (Accept-Language → currency format)
 * RE-008: Cache-Control + ETag headers on public listing endpoints
 */
import { Hono } from 'hono';
import { jwtAuthMiddleware, requireRole, getTenantId, verifyJWT } from '@webwaka/core';
import { enrichListingPrices, getLocaleInfo } from '../../../utils/currency';

export interface Env {
  DB: D1Database;
  DOCUMENTS: R2Bucket;
  TENANT_CONFIG: KVNamespace;
  JWT_SECRET: string;
  ENVIRONMENT?: string;
}

const app = new Hono<{ Bindings: Env }>();

// RE-001/RE-002: GET listing routes (search + detail + proximity) are public.
// The valuation endpoint is protected (checked inline below).
// publicRoutes format: { path, method? } — uses startsWith matching in @webwaka/core.
const PUBLIC_ROUTES = [
  { path: '/api/re/listings', method: 'GET' },
  { path: '/api/re/listings', method: 'HEAD' },
];

app.use('/api/re/*', jwtAuthMiddleware({ publicRoutes: PUBLIC_ROUTES }));

// Safe tenantId helper for routes that may be called without a JWT
function safeTenantId(c: Parameters<typeof getTenantId>[0]): string | null {
  try {
    return getTenantId(c);
  } catch {
    return null;
  }
}

// ─── Haversine distance (km) between two lat/lng points ───────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── ETag helper ──────────────────────────────────────────────────────────────
function computeETag(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return `"${Math.abs(hash).toString(16)}"`;
}

// ─── GET /api/re/listings — Search listings ───────────────────────────────────
// RE-001: Advanced filters (type, property_type, state, city, price, bedrooms,
//         bathrooms, toilets, lga, size_sqm range, amenities, q full-text,
//         verified_agents_only)
// RE-002: Proximity search (lat, lng, radius_km) — bounding box in SQL,
//         Haversine refinement in JS
// RE-007: Accept-Language → locale-aware price_display field
// RE-008: Cache-Control + ETag headers
app.get('/api/re/listings', async (c) => {
  const tenantId = safeTenantId(c) ?? c.req.query('tenant_id');
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  // ── Parse filters ──────────────────────────────────────────────────────────
  const listingType   = c.req.query('type');
  const propertyType  = c.req.query('property_type');
  const state         = c.req.query('state');
  const city          = c.req.query('city');
  const lga           = c.req.query('lga');
  const minPrice      = c.req.query('min_price');
  const maxPrice      = c.req.query('max_price');
  const bedrooms      = c.req.query('bedrooms');
  const bathrooms     = c.req.query('bathrooms');
  const toilets       = c.req.query('toilets');
  const minSizeSqm    = c.req.query('min_size_sqm');
  const maxSizeSqm    = c.req.query('max_size_sqm');
  const amenities     = c.req.query('amenities');   // comma-separated, e.g. "pool,gym"
  const q             = c.req.query('q');            // full-text search on title/address
  const verifiedOnly  = c.req.query('verified_agents_only') === '1';
  const statusFilter  = c.req.query('status') ?? 'active';

  // ── Proximity params ───────────────────────────────────────────────────────
  const latParam      = c.req.query('lat');
  const lngParam      = c.req.query('lng');
  const radiusKmParam = c.req.query('radius_km');
  const isProximity   = latParam && lngParam && radiusKmParam;

  let centerLat: number | undefined;
  let centerLng: number | undefined;
  let radiusKm: number | undefined;
  let latMin: number | undefined, latMax: number | undefined;
  let lngMin: number | undefined, lngMax: number | undefined;

  if (isProximity) {
    centerLat = parseFloat(latParam!);
    centerLng = parseFloat(lngParam!);
    radiusKm  = parseFloat(radiusKmParam!);

    if (isNaN(centerLat) || isNaN(centerLng) || isNaN(radiusKm) || radiusKm <= 0) {
      return c.json({ success: false, error: 'lat, lng must be valid numbers and radius_km must be > 0' }, 400);
    }
    if (radiusKm > 500) {
      return c.json({ success: false, error: 'radius_km must not exceed 500' }, 400);
    }

    // Approximate bounding box (1 degree lat ≈ 111 km)
    const latDelta = radiusKm / 111;
    const lngDelta = radiusKm / (111 * Math.cos((centerLat * Math.PI) / 180));
    latMin = centerLat - latDelta;
    latMax = centerLat + latDelta;
    lngMin = centerLng - lngDelta;
    lngMax = centerLng + lngDelta;
  }

  const limit  = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);
  const offset = parseInt(c.req.query('offset') ?? '0');

  // ── Build query ────────────────────────────────────────────────────────────
  let query = `
    SELECT l.*,
           GROUP_CONCAT(i.r2_key) as image_keys,
           MAX(CASE WHEN a.verification_status = 'verified' THEN 1 ELSE 0 END) as has_verified_agent
    FROM re_listings l
    LEFT JOIN re_listing_images i ON i.listing_id = l.id AND i.is_primary = 1
    LEFT JOIN re_agent_listings al ON al.listing_id = l.id AND al.tenant_id = l.tenant_id
    LEFT JOIN re_agents a ON a.id = al.agent_id
    WHERE l.tenant_id = ? AND l.status = ?`;

  const params: (string | number)[] = [tenantId, statusFilter];

  if (listingType)  { query += ' AND l.listing_type = ?';    params.push(listingType); }
  if (propertyType) { query += ' AND l.property_type = ?';   params.push(propertyType); }
  if (state)        { query += ' AND l.state = ?';           params.push(state); }
  if (city)         { query += ' AND l.city LIKE ?';         params.push(`%${city}%`); }
  if (lga)          { query += ' AND l.lga LIKE ?';          params.push(`%${lga}%`); }
  if (minPrice)     { query += ' AND l.price_kobo >= ?';     params.push(parseInt(minPrice)); }
  if (maxPrice)     { query += ' AND l.price_kobo <= ?';     params.push(parseInt(maxPrice)); }
  if (bedrooms)     { query += ' AND l.bedrooms >= ?';       params.push(parseInt(bedrooms)); }
  if (bathrooms)    { query += ' AND l.bathrooms >= ?';      params.push(parseInt(bathrooms)); }
  if (toilets)      { query += ' AND l.toilets >= ?';        params.push(parseInt(toilets)); }
  if (minSizeSqm)   { query += ' AND l.size_sqm >= ?';       params.push(parseInt(minSizeSqm)); }
  if (maxSizeSqm)   { query += ' AND l.size_sqm <= ?';       params.push(parseInt(maxSizeSqm)); }

  // Amenities: each requested amenity must appear in the CSV column
  if (amenities) {
    const tags = amenities.split(',').map(s => s.trim()).filter(Boolean);
    for (const tag of tags) {
      query += ' AND (l.amenities LIKE ? OR l.amenities LIKE ? OR l.amenities LIKE ? OR l.amenities = ?)';
      params.push(`${tag},%`, `%,${tag},%`, `%,${tag}`, tag);
    }
  }

  // Full-text search on title, description, address
  if (q) {
    query += ' AND (l.title LIKE ? OR l.description LIKE ? OR l.address LIKE ?)';
    const likeQ = `%${q}%`;
    params.push(likeQ, likeQ, likeQ);
  }

  if (verifiedOnly) { query += " AND a.verification_status = 'verified'"; }

  // Proximity bounding box pre-filter
  if (isProximity && latMin !== undefined) {
    query += ' AND l.latitude BETWEEN ? AND ? AND l.longitude BETWEEN ? AND ?';
    params.push(latMin, latMax!, lngMin!, lngMax!);
  }

  // For proximity we fetch more rows so Haversine can filter down
  const dbLimit  = isProximity ? Math.min(limit * 10, 1000) : limit;
  const dbOffset = isProximity ? 0 : offset;

  query += ' GROUP BY l.id ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
  params.push(dbLimit, dbOffset);

  const results = await c.env.DB.prepare(query).bind(...params).all();
  let rows = results.results as Array<Record<string, unknown>>;

  // ── Haversine refinement for proximity search ──────────────────────────────
  if (isProximity && centerLat !== undefined && centerLng !== undefined && radiusKm !== undefined) {
    rows = rows
      .filter(r => {
        const lat = r.latitude as number | null;
        const lng = r.longitude as number | null;
        if (lat == null || lng == null) return false;
        return haversineKm(centerLat!, centerLng!, lat, lng) <= radiusKm!;
      })
      .map(r => ({
        ...r,
        distance_km: Math.round(
          haversineKm(centerLat!, centerLng!, r.latitude as number, r.longitude as number) * 10,
        ) / 10,
      }))
      .sort((a, b) => (a.distance_km as number) - (b.distance_km as number))
      .slice(offset, offset + limit);
  }

  // ── RE-007: Locale-aware price enrichment ──────────────────────────────────
  const acceptLang = c.req.header('Accept-Language');
  const { locale, currency } = getLocaleInfo(acceptLang);
  const enriched = rows.map(r => enrichListingPrices(r, locale, currency));

  // ── RE-008: Cache-Control + ETag ───────────────────────────────────────────
  const etag = computeETag(enriched);
  const ifNoneMatch = c.req.header('If-None-Match');
  if (ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return c.json(
    { success: true, data: enriched, meta: { limit, offset, locale, currency } },
    200,
    {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      ETag: etag,
    },
  );
});

// ─── GET /api/re/listings/:id — Get listing detail ────────────────────────────
// RE-007: price_display enrichment
// RE-008: Cache-Control + ETag
app.get('/api/re/listings/:id', async (c) => {
  const tenantId = safeTenantId(c) ?? c.req.query('tenant_id');
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const id = c.req.param('id');
  const listing = await c.env.DB.prepare(
    `SELECT * FROM re_listings WHERE id = ? AND tenant_id = ?`
  ).bind(id, tenantId).first<Record<string, unknown>>();

  if (!listing) return c.json({ success: false, error: 'Listing not found' }, 404);

  const images = await c.env.DB.prepare(
    `SELECT * FROM re_listing_images WHERE listing_id = ? ORDER BY sort_order ASC`
  ).bind(id).all();

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

  const acceptLang = c.req.header('Accept-Language');
  const { locale, currency } = getLocaleInfo(acceptLang);
  const enrichedListing = enrichListingPrices(listing, locale, currency);

  const responseData = {
    ...enrichedListing,
    images: images.results,
    agents: agents.results,
    has_verified_agent: hasVerifiedAgent,
    locale,
    currency,
  };

  const etag = computeETag(responseData);
  const ifNoneMatch = c.req.header('If-None-Match');
  if (ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return c.json(
    { success: true, data: responseData },
    200,
    {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      ETag: etag,
    },
  );
});

// ─── GET /api/re/listings/:id/valuation — CMA property valuation ──────────────
// RE-006: Comparative Market Analysis using recent completed transactions
// in the same city and property_type.
// Returns: estimated price range, confidence level, comparable count.
// Note: This route sits under the public GET /api/re/listings/* prefix, so
// jwtAuthMiddleware bypasses token enforcement. We enforce auth manually:
// the user MUST supply a valid Bearer token and have an agent/admin role.
app.get('/api/re/listings/:id/valuation', async (c) => {
  // Manual JWT check: jwtAuthMiddleware bypasses auth for all GET /api/re/listings/* routes.
  // We verify the token explicitly here so valuation remains protected.
  const authHeader = c.req.header('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized: Bearer token required for valuations' }, 401);
  }
  const token = authHeader.slice(7).trim();
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ success: false, error: 'Unauthorized: invalid or expired token' }, 401);
  }
  const allowedRoles = ['agent', 'admin', 'super_admin'];
  if (!payload.role || !allowedRoles.includes(payload.role as string)) {
    return c.json({ success: false, error: `Forbidden: valuation requires role in [${allowedRoles.join(', ')}]` }, 403);
  }

  const tenantId = (payload.tenantId as string | undefined) ?? safeTenantId(c) ?? c.req.query('tenant_id');
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const id = c.req.param('id');

  const listing = await c.env.DB.prepare(
    `SELECT id, city, state, property_type, listing_type, bedrooms, size_sqm, price_kobo
     FROM re_listings WHERE id = ? AND tenant_id = ?`
  ).bind(id, tenantId).first<{
    id: string; city: string; state: string; property_type: string;
    listing_type: string; bedrooms: number | null; size_sqm: number | null; price_kobo: number;
  }>();

  if (!listing) return c.json({ success: false, error: 'Listing not found' }, 404);

  // ── Fetch comparable completed transactions (same city + property_type) ────
  // Look at transactions from the last 12 months for maximum relevance
  const twelveMonthsAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;

  const comparables = await c.env.DB.prepare(
    `SELECT t.agreed_price_kobo, l.size_sqm, l.bedrooms, l.city, l.state
     FROM re_transactions t
     JOIN re_listings l ON l.id = t.listing_id
     WHERE l.tenant_id = ?
       AND l.property_type = ?
       AND l.listing_type = ?
       AND l.city = ?
       AND t.transaction_status = 'completed'
       AND t.created_at >= ?
       AND t.id != ?
     ORDER BY t.created_at DESC
     LIMIT 50`
  ).bind(tenantId, listing.property_type, listing.listing_type, listing.city, twelveMonthsAgo, id).all<{
    agreed_price_kobo: number; size_sqm: number | null; bedrooms: number | null;
    city: string; state: string;
  }>();

  const comps = comparables.results;

  if (comps.length === 0) {
    // No local comparables — try same state
    const stateComps = await c.env.DB.prepare(
      `SELECT t.agreed_price_kobo, l.size_sqm, l.bedrooms
       FROM re_transactions t
       JOIN re_listings l ON l.id = t.listing_id
       WHERE l.tenant_id = ?
         AND l.property_type = ?
         AND l.listing_type = ?
         AND l.state = ?
         AND t.transaction_status = 'completed'
         AND t.created_at >= ?
       ORDER BY t.created_at DESC
       LIMIT 30`
    ).bind(tenantId, listing.property_type, listing.listing_type, listing.state, twelveMonthsAgo).all<{
      agreed_price_kobo: number; size_sqm: number | null; bedrooms: number | null;
    }>();

    const stateData = stateComps.results;
    if (stateData.length === 0) {
      return c.json({
        success: true,
        data: {
          listing_id: id,
          valuation_available: false,
          reason: 'Insufficient comparable transactions in this area to generate a valuation.',
          listed_price_kobo: listing.price_kobo,
          comparable_count: 0,
        },
      });
    }

    return buildValuationResponse(id, listing.price_kobo, stateData, 'state', c);
  }

  return buildValuationResponse(id, listing.price_kobo, comps, 'city', c);
});

function buildValuationResponse(
  id: string,
  listedPriceKobo: number,
  comps: Array<{ agreed_price_kobo: number; size_sqm: number | null; bedrooms: number | null }>,
  scope: 'city' | 'state',
  c: { json: (data: unknown, status?: number) => Response },
): Response {
  const prices = comps.map(r => r.agreed_price_kobo);
  const count  = prices.length;

  prices.sort((a, b) => a - b);

  const median = count % 2 === 0
    ? ((prices[count / 2 - 1]! + prices[count / 2]!) / 2)
    : prices[Math.floor(count / 2)]!;
  const mean  = prices.reduce((s, p) => s + p, 0) / count;
  const p25   = prices[Math.floor(count * 0.25)] ?? prices[0]!;
  const p75   = prices[Math.floor(count * 0.75)] ?? prices[count - 1]!;

  const variance = prices.reduce((s, p) => s + (p - mean) ** 2, 0) / count;
  const stdDev   = Math.sqrt(variance);
  const cv       = mean > 0 ? stdDev / mean : 1;

  const confidence: 'high' | 'medium' | 'low' =
    count >= 10 && cv < 0.3 ? 'high'
    : count >= 5 || cv < 0.5  ? 'medium'
    : 'low';

  const deviationPct = listedPriceKobo > 0
    ? Math.round(((listedPriceKobo - median) / median) * 1000) / 10
    : null;

  return c.json({
    success: true,
    data: {
      listing_id: id,
      valuation_available: true,
      scope,
      comparable_count: count,
      confidence,
      estimate_kobo: {
        median:    Math.round(median),
        mean:      Math.round(mean),
        range_low: Math.round(p25),
        range_high: Math.round(p75),
      },
      listed_price_kobo: listedPriceKobo,
      listed_vs_median_pct: deviationPct,
      note: confidence === 'low'
        ? 'Low comparable count — valuation is indicative only.'
        : `Based on ${count} comparable ${scope}-level transactions in the past 12 months.`,
    },
  }) as Response;
}

// ─── POST /api/re/listings — Create listing ───────────────────────────────────
// T-RES-01: Agents must be ESVARBON-verified to publish listings.
// RE-001: Now accepts amenities field (CSV string)
app.post('/api/re/listings', requireRole(['agent', 'admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const user = (c as any).get('user') as { sub?: string; role?: string } | undefined;
  const userId   = user?.sub ?? null;
  const userRole = user?.role ?? 'agent';

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
    amenities?: string | string[];
  }>();

  if (!body.title || !body.listing_type || !body.property_type || !body.address || !body.city || !body.state) {
    return c.json({ success: false, error: 'Missing required fields: title, listing_type, property_type, address, city, state' }, 400);
  }

  if (!Number.isInteger(body.price_kobo) || body.price_kobo <= 0) {
    return c.json({ success: false, error: 'price_kobo must be a positive integer (kobo)' }, 400);
  }

  // Normalise amenities: array or CSV → stored as CSV
  let amenitiesCsv: string | null = null;
  if (body.amenities) {
    const tags = Array.isArray(body.amenities)
      ? body.amenities.map(s => s.trim()).filter(Boolean)
      : body.amenities.split(',').map(s => s.trim()).filter(Boolean);
    amenitiesCsv = tags.length ? tags.join(',') : null;
  }

  const id  = `re_lst_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO re_listings
       (id, tenant_id, title, description, listing_type, property_type, bedrooms, bathrooms, toilets,
        size_sqm, price_kobo, service_charge_kobo, caution_fee_kobo, agency_fee_kobo,
        address, city, state, lga, latitude, longitude, amenities,
        status, is_verified, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?, ?)`
  ).bind(
    id, tenantId, body.title, body.description ?? null,
    body.listing_type, body.property_type,
    body.bedrooms ?? null, body.bathrooms ?? null, body.toilets ?? null, body.size_sqm ?? null,
    body.price_kobo,
    body.service_charge_kobo ?? 0, body.caution_fee_kobo ?? 0, body.agency_fee_kobo ?? 0,
    body.address, body.city, body.state, body.lga ?? null,
    body.latitude ?? null, body.longitude ?? null,
    amenitiesCsv,
    userId ?? 'system', now, now,
  ).run();

  return c.json({ success: true, data: { id, status: 'active', created_at: now } }, 201);
});

// ─── PATCH /api/re/listings/:id — Update listing ──────────────────────────────
app.patch('/api/re/listings/:id', requireRole(['agent', 'admin', 'super_admin']), async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return c.json({ success: false, error: 'tenant_id required' }, 400);

  const id   = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const now  = Date.now();

  for (const field of ['price_kobo', 'service_charge_kobo', 'caution_fee_kobo', 'agency_fee_kobo']) {
    if (field in body && (!Number.isInteger(body[field]) || (body[field] as number) < 0)) {
      return c.json({ success: false, error: `${field} must be a non-negative integer (kobo)` }, 400);
    }
  }

  // Handle amenities normalisation on update
  if ('amenities' in body && body.amenities != null) {
    const raw = body.amenities;
    const tags = Array.isArray(raw)
      ? (raw as string[]).map(s => String(s).trim()).filter(Boolean)
      : String(raw).split(',').map(s => s.trim()).filter(Boolean);
    body.amenities = tags.length ? tags.join(',') : null;
  }

  const allowed = ['title', 'description', 'listing_type', 'property_type', 'bedrooms', 'bathrooms',
    'toilets', 'size_sqm', 'price_kobo', 'service_charge_kobo', 'caution_fee_kobo', 'agency_fee_kobo',
    'address', 'city', 'state', 'lga', 'latitude', 'longitude', 'status', 'amenities'];
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
