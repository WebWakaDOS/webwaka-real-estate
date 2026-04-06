-- Migration 003: Amenities column + additional search indexes
--
-- Adds amenities TEXT column to re_listings for comma-separated amenity tags.
-- Adds composite indexes to support proximity bounding-box queries.
--
-- RE-001: Advanced search filter support (amenities, size_sqm range)
-- RE-002: Proximity search support (lat/lng bounding box)
-- Added: 2026-04-06

ALTER TABLE re_listings ADD COLUMN amenities TEXT; -- CSV: e.g. "pool,gym,parking,security,generator"

CREATE INDEX IF NOT EXISTS idx_re_listings_lat_lng ON re_listings(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_re_listings_size_sqm ON re_listings(size_sqm)
  WHERE size_sqm IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_re_listings_bedrooms_bathrooms ON re_listings(bedrooms, bathrooms);

CREATE INDEX IF NOT EXISTS idx_re_listings_lga ON re_listings(lga)
  WHERE lga IS NOT NULL;
