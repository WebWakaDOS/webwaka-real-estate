-- Migration 002: ESVARBON Agent Verification
--
-- Adds structured verification lifecycle to re_agents:
--   - verification_status: tracks the state machine
--   - verification_method: how verification was achieved
--   - esvarbon_doc_key:    R2 key for uploaded ESVARBON certificate / ID card
--   - verified_at / verified_by: immutable audit trail
--   - rejection_reason:   set by admin on rejection
--   - esvarbon_api_raw:   JSON response from ESVARBON API (if available)
--
-- State machine:
--   unverified → pending_api  → verified (esvarbon_api)
--   unverified → pending_docs → manual_review → verified (manual)
--                                             → rejected
--
-- Blueprint Reference: Part 9.2 (Multi-Tenancy), Part 9.3 (RBAC)
-- Added: T-RES-01

ALTER TABLE re_agents ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified'
  CHECK (verification_status IN ('unverified', 'pending_api', 'pending_docs', 'manual_review', 'verified', 'rejected'));

ALTER TABLE re_agents ADD COLUMN verification_method TEXT
  CHECK (verification_method IN ('esvarbon_api', 'manual', NULL));

ALTER TABLE re_agents ADD COLUMN esvarbon_doc_key TEXT;       -- R2 key for ESVARBON certificate
ALTER TABLE re_agents ADD COLUMN esvarbon_doc_uploaded_at INTEGER;
ALTER TABLE re_agents ADD COLUMN esvarbon_api_raw TEXT;       -- Raw JSON from ESVARBON API
ALTER TABLE re_agents ADD COLUMN verified_at INTEGER;         -- Epoch ms when verified
ALTER TABLE re_agents ADD COLUMN verified_by TEXT;            -- user_id of admin who verified (manual path)
ALTER TABLE re_agents ADD COLUMN rejection_reason TEXT;       -- Set on rejection
ALTER TABLE re_agents ADD COLUMN verification_requested_at INTEGER; -- When agent triggered verification

CREATE INDEX IF NOT EXISTS idx_re_agents_verification_status ON re_agents(verification_status);
