-- WebWaka Real Estate Suite — D1 Schema Migration 001
-- All monetary values stored as INTEGER (kobo) — Invariant 5: Nigeria First
-- Multi-tenant: every table includes tenant_id for strict row-level isolation

-- ─── Properties ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS properties (
  id             TEXT    PRIMARY KEY,
  tenant_id      TEXT    NOT NULL,
  title          TEXT    NOT NULL,
  type           TEXT    NOT NULL CHECK (type IN ('residential', 'commercial', 'land', 'industrial')),
  listing_type   TEXT    NOT NULL CHECK (listing_type IN ('sale', 'rent', 'shortlet')),
  status         TEXT    NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'under_offer', 'sold', 'let', 'withdrawn')),
  price_kobo     INTEGER NOT NULL CHECK (price_kobo > 0),   -- ALWAYS kobo
  currency       TEXT    NOT NULL DEFAULT 'NGN',
  location       TEXT    NOT NULL,
  address        TEXT    NOT NULL DEFAULT '',
  state          TEXT    NOT NULL,
  lga            TEXT    NOT NULL DEFAULT '',
  bedrooms       INTEGER,
  bathrooms      INTEGER,
  toilets        INTEGER,
  size_m2        REAL,
  description    TEXT    NOT NULL DEFAULT '',
  agent_id       TEXT,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_properties_tenant_id    ON properties(tenant_id);
CREATE INDEX IF NOT EXISTS idx_properties_state        ON properties(tenant_id, state);
CREATE INDEX IF NOT EXISTS idx_properties_listing_type ON properties(tenant_id, listing_type);
CREATE INDEX IF NOT EXISTS idx_properties_type         ON properties(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_properties_status       ON properties(tenant_id, status);

-- ─── Tenancies ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenancies (
  id             TEXT    PRIMARY KEY,
  tenant_id      TEXT    NOT NULL,
  property_id    TEXT    NOT NULL REFERENCES properties(id),
  tenant_name    TEXT    NOT NULL,
  tenant_phone   TEXT    NOT NULL,
  tenant_email   TEXT,
  start_date     TEXT    NOT NULL,
  end_date       TEXT    NOT NULL,
  rent_kobo      INTEGER NOT NULL CHECK (rent_kobo > 0),     -- ALWAYS kobo
  deposit_kobo   INTEGER NOT NULL CHECK (deposit_kobo >= 0), -- ALWAYS kobo
  status         TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'terminated', 'pending')),
  agent_id       TEXT,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenancies_tenant_id   ON tenancies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_property_id ON tenancies(tenant_id, property_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_status      ON tenancies(tenant_id, status);

-- ─── Payment Records ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_records (
  id             TEXT    PRIMARY KEY,
  tenant_id      TEXT    NOT NULL,
  tenancy_id     TEXT    NOT NULL REFERENCES tenancies(id),
  reference      TEXT    NOT NULL UNIQUE,
  amount_kobo    INTEGER NOT NULL CHECK (amount_kobo > 0), -- ALWAYS kobo
  currency       TEXT    NOT NULL DEFAULT 'NGN',
  status         TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  payment_type   TEXT    NOT NULL DEFAULT 'rent' CHECK (payment_type IN ('rent', 'deposit', 'agency_fee', 'other')),
  paid_at        TEXT,
  created_at     TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_records_tenant_id  ON payment_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_tenancy_id ON payment_records(tenant_id, tenancy_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_reference  ON payment_records(reference);

-- ─── Property Documents ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_documents (
  id             TEXT    PRIMARY KEY,
  tenant_id      TEXT    NOT NULL,
  property_id    TEXT    NOT NULL REFERENCES properties(id),
  document_type  TEXT    NOT NULL CHECK (document_type IN ('c_of_o', 'deed_of_assignment', 'survey_plan', 'building_plan', 'receipt', 'other')),
  file_key       TEXT    NOT NULL, -- R2 object key
  file_name      TEXT    NOT NULL,
  uploaded_by    TEXT    NOT NULL,
  created_at     TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_property_documents_tenant_id   ON property_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_property_documents_property_id ON property_documents(tenant_id, property_id);
