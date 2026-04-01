-- Migration 001: WebWaka Real Estate Core Schema
--
-- Tables:
--   - re_listings:       Property listings (for sale / for rent)
--   - re_listing_images: Property images (R2 references)
--   - re_inquiries:      Buyer/renter inquiries on listings
--   - re_transactions:   Property sale/rent transactions (kobo-compliant)
--   - re_agents:         Licensed estate agents (ESVARBON compliance)
--   - re_agent_listings: Many-to-many: agents assigned to listings
--   - re_payments:       Paystack payment records for transactions
--
-- Monetary values: ALL stored as INTEGER KOBO (NGN × 100). No floats.
-- Multi-tenancy: ALL tables include tenant_id TEXT NOT NULL.
-- Blueprint Reference: Part 9.2 (Multi-Tenancy, Monetary Integrity)
-- Added: 2026-04-01

-- ─── Listings ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_listings (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  listing_type      TEXT NOT NULL CHECK (listing_type IN ('sale', 'rent', 'shortlet')),
  property_type     TEXT NOT NULL CHECK (property_type IN ('residential', 'commercial', 'land', 'industrial')),
  bedrooms          INTEGER,
  bathrooms         INTEGER,
  toilets           INTEGER,
  size_sqm          INTEGER,                   -- square metres (integer)
  price_kobo        INTEGER NOT NULL CHECK (price_kobo > 0),  -- sale price or annual rent in kobo
  service_charge_kobo INTEGER DEFAULT 0,       -- annual service charge in kobo
  caution_fee_kobo  INTEGER DEFAULT 0,         -- caution deposit in kobo
  agency_fee_kobo   INTEGER DEFAULT 0,         -- agency fee in kobo
  address           TEXT NOT NULL,
  city              TEXT NOT NULL,
  state             TEXT NOT NULL,
  lga               TEXT,                      -- Local Government Area
  latitude          REAL,                      -- GPS coordinates for map display
  longitude         REAL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'under_offer', 'sold', 'rented', 'inactive')),
  is_verified       INTEGER NOT NULL DEFAULT 0,  -- 1 = ESVARBON-verified
  created_by        TEXT NOT NULL,             -- user_id of listing creator
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_re_listings_tenant_id ON re_listings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_re_listings_status ON re_listings(status);
CREATE INDEX IF NOT EXISTS idx_re_listings_listing_type ON re_listings(listing_type);
CREATE INDEX IF NOT EXISTS idx_re_listings_state_city ON re_listings(state, city);
CREATE INDEX IF NOT EXISTS idx_re_listings_price_kobo ON re_listings(price_kobo);
CREATE INDEX IF NOT EXISTS idx_re_listings_created_at ON re_listings(created_at DESC);

-- ─── Listing Images ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_listing_images (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  listing_id  TEXT NOT NULL REFERENCES re_listings(id) ON DELETE CASCADE,
  r2_key      TEXT NOT NULL,        -- R2 object key
  caption     TEXT,
  is_primary  INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_re_listing_images_listing_id ON re_listing_images(listing_id);
CREATE INDEX IF NOT EXISTS idx_re_listing_images_tenant_id ON re_listing_images(tenant_id);

-- ─── Inquiries ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_inquiries (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  listing_id      TEXT NOT NULL REFERENCES re_listings(id) ON DELETE CASCADE,
  inquirer_id     TEXT,             -- user_id if logged in
  inquirer_name   TEXT NOT NULL,
  inquirer_phone  TEXT NOT NULL,
  inquirer_email  TEXT,
  message         TEXT,
  status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'viewing_scheduled', 'closed')),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_re_inquiries_listing_id ON re_inquiries(listing_id);
CREATE INDEX IF NOT EXISTS idx_re_inquiries_tenant_id ON re_inquiries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_re_inquiries_status ON re_inquiries(status);

-- ─── Agents ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_agents (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL,
  user_id             TEXT NOT NULL,
  full_name           TEXT NOT NULL,
  phone               TEXT NOT NULL,
  email               TEXT NOT NULL,
  esvarbon_reg_no     TEXT,           -- ESVARBON registration number (Nigeria)
  esvarbon_verified   INTEGER NOT NULL DEFAULT 0,
  bio                 TEXT,
  profile_image_key   TEXT,           -- R2 key
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_re_agents_tenant_id ON re_agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_re_agents_user_id ON re_agents(user_id);

-- ─── Agent-Listing Assignments ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_agent_listings (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  agent_id    TEXT NOT NULL REFERENCES re_agents(id) ON DELETE CASCADE,
  listing_id  TEXT NOT NULL REFERENCES re_listings(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'co-agent')),
  assigned_at INTEGER NOT NULL,
  UNIQUE(tenant_id, agent_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_re_agent_listings_agent_id ON re_agent_listings(agent_id);
CREATE INDEX IF NOT EXISTS idx_re_agent_listings_listing_id ON re_agent_listings(listing_id);
CREATE INDEX IF NOT EXISTS idx_re_agent_listings_tenant_id ON re_agent_listings(tenant_id);

-- ─── Transactions ─────────────────────────────────────────────────────────────
-- Records property sale/rent transactions.
-- ALL monetary values are integer kobo. No floats.
CREATE TABLE IF NOT EXISTS re_transactions (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  listing_id            TEXT NOT NULL REFERENCES re_listings(id),
  transaction_type      TEXT NOT NULL CHECK (transaction_type IN ('sale', 'rent', 'shortlet')),
  buyer_id              TEXT,             -- user_id of buyer/renter
  buyer_name            TEXT NOT NULL,
  buyer_phone           TEXT NOT NULL,
  buyer_email           TEXT,
  agent_id              TEXT REFERENCES re_agents(id),
  agreed_price_kobo     INTEGER NOT NULL CHECK (agreed_price_kobo > 0),
  agency_fee_kobo       INTEGER NOT NULL DEFAULT 0,
  legal_fee_kobo        INTEGER NOT NULL DEFAULT 0,
  caution_fee_kobo      INTEGER NOT NULL DEFAULT 0,
  total_payable_kobo    INTEGER NOT NULL CHECK (total_payable_kobo > 0),
  amount_paid_kobo      INTEGER NOT NULL DEFAULT 0,
  balance_kobo          INTEGER GENERATED ALWAYS AS (total_payable_kobo - amount_paid_kobo) VIRTUAL,
  payment_status        TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'refunded')),
  transaction_status    TEXT NOT NULL DEFAULT 'initiated' CHECK (transaction_status IN ('initiated', 'in_progress', 'completed', 'cancelled')),
  rent_start_date       INTEGER,          -- Unix ms, for rent/shortlet
  rent_end_date         INTEGER,          -- Unix ms, for rent/shortlet
  notes                 TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_re_transactions_tenant_id ON re_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_re_transactions_listing_id ON re_transactions(listing_id);
CREATE INDEX IF NOT EXISTS idx_re_transactions_payment_status ON re_transactions(payment_status);
CREATE INDEX IF NOT EXISTS idx_re_transactions_created_at ON re_transactions(created_at DESC);

-- ─── Payments ─────────────────────────────────────────────────────────────────
-- Paystack payment records for real estate transactions.
-- Idempotent: UNIQUE on (tenant_id, paystack_reference).
CREATE TABLE IF NOT EXISTS re_payments (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  transaction_id        TEXT NOT NULL REFERENCES re_transactions(id),
  paystack_reference    TEXT NOT NULL,
  amount_kobo           INTEGER NOT NULL CHECK (amount_kobo > 0),
  payment_method        TEXT,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  paystack_event_json   TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  UNIQUE(tenant_id, paystack_reference)
);

CREATE INDEX IF NOT EXISTS idx_re_payments_transaction_id ON re_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_re_payments_tenant_id ON re_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_re_payments_paystack_reference ON re_payments(paystack_reference);
