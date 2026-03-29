/**
 * Auth Middleware — WebWaka Real Estate Suite
 *
 * Invariant 1: Build Once Use Infinitely
 * ALL auth primitives are re-exported from @webwaka/core.
 * NEVER re-implement validateJWT, requireRole, secureCORS, or rateLimit in this repo.
 * If a primitive is missing, add it to @webwaka/core and consume it here.
 */

export {
  validateJWT,
  signJWT,
  jwtAuthMiddleware,
  requireRole,
  secureCORS,
  rateLimit,
  type JWTPayload,
  type WebWakaRole,
} from '@webwaka/core';
