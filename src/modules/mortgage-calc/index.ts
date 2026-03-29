/**
 * Mortgage Calculator Module — WebWaka Real Estate Suite
 *
 * Endpoints:
 *   POST /api/mortgage/calculate    — compute mortgage schedule
 *   GET  /api/mortgage/rates        — get current Nigerian mortgage rates
 *
 * Security:
 *   - tenantId ALWAYS from JWT context — NEVER from headers/body
 *   - All monetary values in kobo integers
 *
 * Invariant 5: Nigeria First
 *   - Default rates reflect Nigerian mortgage market (NHF, commercial banks)
 *   - All amounts in kobo
 */

import { Hono } from 'hono';
import { requireRole } from '../../middleware/auth';
import type { Bindings, MortgageCalculation } from '../../core/types';

export const mortgageCalcRouter = new Hono<{ Bindings: Bindings }>();

// Nigerian mortgage reference rates (basis points)
const NIGERIAN_MORTGAGE_RATES = [
  { lender: 'National Housing Fund (NHF)', annualRateBps: 600, minTenureMonths: 12, maxTenureMonths: 360 },
  { lender: 'Federal Mortgage Bank of Nigeria', annualRateBps: 600, minTenureMonths: 12, maxTenureMonths: 360 },
  { lender: 'Commercial Bank (Average)', annualRateBps: 2200, minTenureMonths: 12, maxTenureMonths: 240 },
  { lender: 'Mortgage Bank (Average)', annualRateBps: 1800, minTenureMonths: 12, maxTenureMonths: 240 },
];

/**
 * Calculate monthly mortgage payment using standard amortisation formula.
 * All amounts in kobo integers.
 */
function calculateMortgage(
  propertyPriceKobo: number,
  downPaymentKobo: number,
  annualInterestRateBps: number,
  tenureMonths: number
): MortgageCalculation {
  const loanAmountKobo = propertyPriceKobo - downPaymentKobo;
  const monthlyRate = annualInterestRateBps / 10000 / 12; // bps -> decimal -> monthly

  let monthlyPaymentKobo: number;

  if (monthlyRate === 0) {
    monthlyPaymentKobo = Math.round(loanAmountKobo / tenureMonths);
  } else {
    const factor = Math.pow(1 + monthlyRate, tenureMonths);
    monthlyPaymentKobo = Math.round((loanAmountKobo * monthlyRate * factor) / (factor - 1));
  }

  const totalPaymentKobo = monthlyPaymentKobo * tenureMonths;
  const totalInterestKobo = totalPaymentKobo - loanAmountKobo;

  return {
    propertyPriceKobo,
    downPaymentKobo,
    loanAmountKobo,
    annualInterestRateBps,
    tenureMonths,
    monthlyPaymentKobo,
    totalPaymentKobo,
    totalInterestKobo,
  };
}

// POST /api/mortgage/calculate — compute mortgage schedule
mortgageCalcRouter.post('/calculate', requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'PROPERTY_AGENT', 'VIEWER']), async (c) => {
  const body = await c.req.json<{
    propertyPriceKobo: number;
    downPaymentKobo: number;
    annualInterestRateBps: number;
    tenureMonths: number;
  }>();

  if (!Number.isInteger(body.propertyPriceKobo) || body.propertyPriceKobo <= 0) {
    return c.json({ error: 'propertyPriceKobo must be a positive integer (kobo amount)' }, 400);
  }
  if (!Number.isInteger(body.downPaymentKobo) || body.downPaymentKobo < 0) {
    return c.json({ error: 'downPaymentKobo must be a non-negative integer (kobo amount)' }, 400);
  }
  if (body.downPaymentKobo >= body.propertyPriceKobo) {
    return c.json({ error: 'downPaymentKobo must be less than propertyPriceKobo' }, 400);
  }
  if (!Number.isInteger(body.annualInterestRateBps) || body.annualInterestRateBps < 0) {
    return c.json({ error: 'annualInterestRateBps must be a non-negative integer (basis points)' }, 400);
  }
  if (!Number.isInteger(body.tenureMonths) || body.tenureMonths < 1 || body.tenureMonths > 360) {
    return c.json({ error: 'tenureMonths must be between 1 and 360' }, 400);
  }

  const result = calculateMortgage(
    body.propertyPriceKobo,
    body.downPaymentKobo,
    body.annualInterestRateBps,
    body.tenureMonths
  );

  return c.json({ data: result });
});

// GET /api/mortgage/rates — get Nigerian mortgage reference rates
mortgageCalcRouter.get('/rates', requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'PROPERTY_AGENT', 'VIEWER']), (c) => {
  return c.json({ data: NIGERIAN_MORTGAGE_RATES });
});
