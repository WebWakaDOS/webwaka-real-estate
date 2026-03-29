/**
 * Local mock of @webwaka/core for vitest testing.
 * In production, the real @webwaka/core package is used.
 * This mock mirrors the exact API surface of the real package.
 */

export type WebWakaRole = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'PROPERTY_AGENT' | 'VIEWER' | 'STAFF';

export interface JWTPayload {
  sub: string;
  tenantId: string;
  role: WebWakaRole;
  iat: number;
  exp: number;
}

export async function validateJWT(token: string, secret: string): Promise<JWTPayload | null> {
  if (!token || !secret) return null;
  return {
    sub: 'user-test-123',
    tenantId: 'tenant-abc-123',
    role: 'TENANT_ADMIN',
    iat: Math.floor(Date.now() / 1000) - 60,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
}

export async function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>, secret: string, expiresInSeconds = 3600): Promise<string> {
  return `mock.jwt.token.${payload.sub}.${payload.tenantId}`;
}

export function requireRole(allowedRoles: WebWakaRole[]) {
  return async (c: { get: (key: string) => string }, next: () => Promise<void>) => {
    // In tests, role is pre-set in context by the mock app
    await next();
  };
}

export function jwtAuthMiddleware(jwtSecret: string, sessionsKV: unknown) {
  return async (c: { get: (key: string) => string; set: (key: string, value: string) => void; req: { header: (key: string) => string | undefined } }, next: () => Promise<void>) => {
    // In tests, tenantId and userId are pre-set by the mock app
    await next();
  };
}

export function secureCORS(environment: string) {
  return async (_c: unknown, next: () => Promise<void>) => {
    await next();
  };
}

export function rateLimit(_kv: unknown, _opts: { maxRequests: number; windowSeconds: number }) {
  return async (_c: unknown, next: () => Promise<void>) => {
    await next();
  };
}
