/**
 * Internationalisation — WebWaka Real Estate Suite
 *
 * Invariant 5: Nigeria First — en-NG is the default locale
 * Invariant 6: Africa First — stubs for key African markets
 *
 * Currency: ALL monetary values stored as kobo (NGN × 100) integers.
 * Display formatting is done here — storage is ALWAYS kobo.
 */

export type SupportedLocale =
  | 'en-NG' // Nigeria (default)
  | 'en-GH' // Ghana
  | 'en-KE' // Kenya
  | 'en-ZA' // South Africa
  | 'fr-CI' // Côte d'Ivoire
  | 'yo-NG' // Yoruba (Nigeria)
  | 'ha-NG' // Hausa (Nigeria)
  | 'ig-NG'; // Igbo (Nigeria)

export type SupportedCurrency = 'NGN' | 'GHS' | 'KES' | 'ZAR' | 'XOF' | 'USD' | 'GBP';

// ─── Currency Formatting ──────────────────────────────────────────────────────

const CURRENCY_CONFIG: Record<SupportedCurrency, { symbol: string; subunitFactor: number; locale: string }> = {
  NGN: { symbol: '₦', subunitFactor: 100, locale: 'en-NG' }, // kobo
  GHS: { symbol: 'GH₵', subunitFactor: 100, locale: 'en-GH' }, // pesewa
  KES: { symbol: 'KSh', subunitFactor: 100, locale: 'en-KE' }, // cent
  ZAR: { symbol: 'R', subunitFactor: 100, locale: 'en-ZA' }, // cent
  XOF: { symbol: 'CFA', subunitFactor: 1, locale: 'fr-CI' }, // no subunit
  USD: { symbol: '$', subunitFactor: 100, locale: 'en-US' }, // cent
  GBP: { symbol: '£', subunitFactor: 100, locale: 'en-GB' }, // penny
};

/**
 * Format a subunit integer (kobo, pesewa, etc.) to a human-readable currency string.
 * @param subunitAmount — integer in smallest currency unit (e.g., kobo for NGN)
 * @param currency — ISO 4217 currency code
 * @returns formatted string e.g. "₦2,500,000.00"
 */
export function formatCurrency(subunitAmount: number, currency: SupportedCurrency = 'NGN'): string {
  const config = CURRENCY_CONFIG[currency];
  const majorAmount = subunitAmount / config.subunitFactor;
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: config.subunitFactor === 1 ? 0 : 2,
  }).format(majorAmount);
}

/**
 * Convert a major unit amount (e.g., Naira) to subunit integer (kobo).
 * Always use this when receiving user input to ensure kobo storage.
 */
export function toSubunit(majorAmount: number, currency: SupportedCurrency = 'NGN'): number {
  return Math.round(majorAmount * CURRENCY_CONFIG[currency].subunitFactor);
}

// ─── Nigerian States & LGAs ───────────────────────────────────────────────────

export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT',
  'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi',
  'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo',
  'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
] as const;

export type NigerianState = typeof NIGERIAN_STATES[number];

// ─── Property Type Labels ─────────────────────────────────────────────────────

export const PROPERTY_TYPE_LABELS: Record<string, Record<SupportedLocale, string>> = {
  residential: {
    'en-NG': 'Residential',
    'en-GH': 'Residential',
    'en-KE': 'Residential',
    'en-ZA': 'Residential',
    'fr-CI': 'Résidentiel',
    'yo-NG': 'Ile Ibugbe',
    'ha-NG': 'Gida',
    'ig-NG': 'Ulo obibi',
  },
  commercial: {
    'en-NG': 'Commercial',
    'en-GH': 'Commercial',
    'en-KE': 'Commercial',
    'en-ZA': 'Commercial',
    'fr-CI': 'Commercial',
    'yo-NG': 'Ile Iṣowo',
    'ha-NG': 'Kasuwanci',
    'ig-NG': 'Ulo azụmaahịa',
  },
  land: {
    'en-NG': 'Land',
    'en-GH': 'Land',
    'en-KE': 'Land',
    'en-ZA': 'Land',
    'fr-CI': 'Terrain',
    'yo-NG': 'Ilẹ',
    'ha-NG': 'Ƙasa',
    'ig-NG': 'Ala',
  },
};

// ─── Listing Type Labels ──────────────────────────────────────────────────────

export const LISTING_TYPE_LABELS: Record<string, Record<SupportedLocale, string>> = {
  sale: {
    'en-NG': 'For Sale',
    'en-GH': 'For Sale',
    'en-KE': 'For Sale',
    'en-ZA': 'For Sale',
    'fr-CI': 'À Vendre',
    'yo-NG': 'Fun Tita',
    'ha-NG': 'Don Siyarwa',
    'ig-NG': 'Iji Ree',
  },
  rent: {
    'en-NG': 'To Let',
    'en-GH': 'To Let',
    'en-KE': 'To Let',
    'en-ZA': 'To Let',
    'fr-CI': 'À Louer',
    'yo-NG': 'Fun Yalo',
    'ha-NG': 'Don Hayar',
    'ig-NG': 'Iji Gbaazụ',
  },
  shortlet: {
    'en-NG': 'Shortlet',
    'en-GH': 'Short Stay',
    'en-KE': 'Short Stay',
    'en-ZA': 'Short Stay',
    'fr-CI': 'Location Courte Durée',
    'yo-NG': 'Yalo Igba Kukuru',
    'ha-NG': 'Hayar Ɗan Lokaci',
    'ig-NG': 'Gbaazụ Oge Dị Mkpụmkpụ',
  },
};

export const DEFAULT_LOCALE: SupportedLocale = 'en-NG';
