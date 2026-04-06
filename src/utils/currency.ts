/**
 * WebWaka Real Estate — Currency & i18n Utilities
 *
 * Handles kobo→NGN conversion and locale-aware currency formatting.
 * Supports NGN (default, Nigeria-First) and other African currencies.
 *
 * Invariant: ALL monetary values are stored and transmitted as integer kobo.
 * This utility is DISPLAY ONLY — never use for storage or computation.
 *
 * RE-007: Africa-First i18n support
 * Blueprint Reference: Part 9.2 (Nigeria-First: kobo integers only)
 */

export type SupportedLocale = 'en-NG' | 'en-GH' | 'en-KE' | 'en-ZA' | 'fr-CI' | 'fr-SN';
export type SupportedCurrency = 'NGN' | 'GHS' | 'KES' | 'ZAR' | 'XOF';

const LOCALE_CURRENCY_MAP: Record<SupportedLocale, SupportedCurrency> = {
  'en-NG': 'NGN',
  'en-GH': 'GHS',
  'en-KE': 'KES',
  'en-ZA': 'ZAR',
  'fr-CI': 'XOF',
  'fr-SN': 'XOF',
};

const SUBUNIT_MULTIPLIER: Record<SupportedCurrency, number> = {
  NGN: 100,
  GHS: 100,
  KES: 100,
  ZAR: 100,
  XOF: 1,
};

/**
 * Convert a kobo (or subunit) integer to a display string for the given locale.
 * Cloudflare Workers supports Intl.NumberFormat.
 */
export function formatKobo(
  amountSubunit: number,
  currency: SupportedCurrency = 'NGN',
  locale: SupportedLocale = 'en-NG',
): string {
  const multiplier = SUBUNIT_MULTIPLIER[currency] ?? 100;
  const amount = amountSubunit / multiplier;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: multiplier === 1 ? 0 : 2,
    maximumFractionDigits: multiplier === 1 ? 0 : 2,
  }).format(amount);
}

/**
 * Derive locale from Accept-Language header value (returns best-match supported locale).
 */
export function resolveLocale(acceptLanguage?: string | null): SupportedLocale {
  if (!acceptLanguage) return 'en-NG';

  const supported = Object.keys(LOCALE_CURRENCY_MAP) as SupportedLocale[];
  const tags = acceptLanguage
    .split(',')
    .map(s => s.trim().split(';')[0]?.trim().toLowerCase() ?? '');

  for (const tag of tags) {
    const match = supported.find(l => l.toLowerCase() === tag || l.toLowerCase().startsWith(tag));
    if (match) return match;
  }
  return 'en-NG';
}

/**
 * Returns locale/currency metadata for a request.
 */
export function getLocaleInfo(acceptLanguage?: string | null): {
  locale: SupportedLocale;
  currency: SupportedCurrency;
} {
  const locale = resolveLocale(acceptLanguage);
  const currency = LOCALE_CURRENCY_MAP[locale];
  return { locale, currency };
}

/**
 * Enrich a listing record with display-ready price fields.
 * Adds `price_display` and `currency` to the record without modifying kobo values.
 */
export function enrichListingPrices<T extends Record<string, unknown>>(
  listing: T,
  locale: SupportedLocale = 'en-NG',
  currency: SupportedCurrency = 'NGN',
): T & { price_display: string; currency: string } {
  const priceKobo = Number(listing.price_kobo ?? 0);
  return {
    ...listing,
    price_display: formatKobo(priceKobo, currency, locale),
    currency,
  };
}
