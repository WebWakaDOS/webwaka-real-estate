/**
 * Shared Types — WebWaka Real Estate Suite
 *
 * All monetary values are stored as kobo (NGN × 100) integers.
 * Invariant 5: Nigeria First
 */

export type PropertyType = 'residential' | 'commercial' | 'land' | 'industrial';
export type ListingType = 'sale' | 'rent' | 'shortlet';
export type PropertyStatus = 'available' | 'under_offer' | 'sold' | 'let' | 'withdrawn';
export type TenancyStatus = 'active' | 'expired' | 'terminated' | 'pending';
export type DocumentType = 'c_of_o' | 'deed_of_assignment' | 'survey_plan' | 'building_plan' | 'receipt' | 'other';

export interface Property {
  id: string;
  tenantId: string;
  title: string;
  type: PropertyType;
  listingType: ListingType;
  status: PropertyStatus;
  priceKobo: number; // Always kobo
  currency: string;
  location: string;
  address: string;
  state: string;
  lga: string;
  bedrooms?: number;
  bathrooms?: number;
  toilets?: number;
  sizeM2?: number;
  description: string;
  agentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tenancy {
  id: string;
  tenantId: string;
  propertyId: string;
  tenantName: string;
  tenantPhone: string;
  tenantEmail?: string;
  startDate: string;
  endDate: string;
  rentKobo: number; // Always kobo
  depositKobo: number; // Always kobo
  status: TenancyStatus;
  agentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MortgageCalculation {
  propertyPriceKobo: number;
  downPaymentKobo: number;
  loanAmountKobo: number;
  annualInterestRateBps: number; // Basis points (e.g., 1800 = 18.00%)
  tenureMonths: number;
  monthlyPaymentKobo: number;
  totalPaymentKobo: number;
  totalInterestKobo: number;
}

// ─── Cloudflare Bindings ──────────────────────────────────────────────────────

export interface Bindings {
  DB: D1Database;
  SESSIONS_KV: KVNamespace;
  RATE_LIMIT_KV: KVNamespace;
  PROPERTY_MEDIA: R2Bucket;
  JWT_SECRET: string;
  PAYSTACK_SECRET_KEY: string;
  OPENROUTER_API_KEY: string;
  TERMII_API_KEY: string;
  ENVIRONMENT: 'staging' | 'production';
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function paginate<T>(items: T[], page: number, limit: number): PaginatedResponse<T> {
  const total = items.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    pagination: { page, limit, total, totalPages },
  };
}
