/**
 * WebWaka Real Estate — Contract Generation Service
 *
 * Generates structured property transaction contracts from transaction data.
 * Returns contract as a structured JSON object + plain-text representation.
 *
 * For PDF rendering, the structured output should be passed to an external
 * PDF service (e.g. via webwaka-ai-platform or a dedicated renderer).
 * Cloudflare Workers has no native PDF generation capability.
 *
 * Monetary values: ALL kobo integers converted to NGN for display only.
 * Stored/computed values remain in kobo throughout.
 *
 * RE-004: Automated contract generation
 * Blueprint Reference: Part 9.2 (Nigeria-First, monetary integrity)
 */

export interface ContractParties {
  buyer_name: string;
  buyer_phone: string;
  buyer_email?: string | null;
  seller_name?: string | null;
  agent_name?: string | null;
  agent_phone?: string | null;
  agent_esvarbon_reg_no?: string | null;
}

export interface ContractProperty {
  title: string;
  address: string;
  city: string;
  state: string;
  lga?: string | null;
  listing_type: string;
  property_type: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
}

export interface ContractFinancials {
  agreed_price_kobo: number;
  agency_fee_kobo: number;
  legal_fee_kobo: number;
  caution_fee_kobo: number;
  total_payable_kobo: number;
  amount_paid_kobo: number;
  currency: string;
}

export interface ContractData {
  contract_id: string;
  transaction_id: string;
  tenant_id: string;
  transaction_type: string;
  generated_at: number;
  generated_at_iso: string;
  parties: ContractParties;
  property: ContractProperty;
  financials: ContractFinancials;
  rent_start_date_iso?: string | null;
  rent_end_date_iso?: string | null;
  notes?: string | null;
  text: string;
}

function koboToNGN(kobo: number): string {
  const naira = kobo / 100;
  return `NGN ${naira.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(epochMs: number | null | undefined): string {
  if (!epochMs) return 'N/A';
  return new Date(epochMs).toLocaleDateString('en-NG', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

export function generateContract(params: {
  transactionId: string;
  tenantId: string;
  transaction: Record<string, unknown>;
  listing: Record<string, unknown>;
  agent: Record<string, unknown> | null;
}): ContractData {
  const { transactionId, tenantId, transaction: txn, listing, agent } = params;

  const now = Date.now();
  const contractId = `re_ctr_${now}_${Math.random().toString(36).slice(2, 9)}`;

  const parties: ContractParties = {
    buyer_name: String(txn.buyer_name ?? ''),
    buyer_phone: String(txn.buyer_phone ?? ''),
    buyer_email: txn.buyer_email as string | null,
    seller_name: null,
    agent_name: agent ? String(agent.full_name ?? '') : null,
    agent_phone: agent ? String(agent.phone ?? '') : null,
    agent_esvarbon_reg_no: agent ? (agent.esvarbon_reg_no as string | null) : null,
  };

  const property: ContractProperty = {
    title: String(listing.title ?? ''),
    address: String(listing.address ?? ''),
    city: String(listing.city ?? ''),
    state: String(listing.state ?? ''),
    lga: listing.lga as string | null,
    listing_type: String(txn.transaction_type ?? listing.listing_type ?? ''),
    property_type: String(listing.property_type ?? ''),
    bedrooms: listing.bedrooms as number | null,
    bathrooms: listing.bathrooms as number | null,
  };

  const financials: ContractFinancials = {
    agreed_price_kobo: Number(txn.agreed_price_kobo ?? 0),
    agency_fee_kobo: Number(txn.agency_fee_kobo ?? 0),
    legal_fee_kobo: Number(txn.legal_fee_kobo ?? 0),
    caution_fee_kobo: Number(txn.caution_fee_kobo ?? 0),
    total_payable_kobo: Number(txn.total_payable_kobo ?? 0),
    amount_paid_kobo: Number(txn.amount_paid_kobo ?? 0),
    currency: 'NGN',
  };

  const rentStartIso = txn.rent_start_date
    ? new Date(Number(txn.rent_start_date)).toISOString()
    : null;
  const rentEndIso = txn.rent_end_date
    ? new Date(Number(txn.rent_end_date)).toISOString()
    : null;

  const transactionTypeLabel =
    property.listing_type === 'sale' ? 'SALE'
    : property.listing_type === 'rent' ? 'TENANCY'
    : 'SHORTLET';

  const propertyDesc = [
    property.property_type,
    property.bedrooms ? `${property.bedrooms} bedroom` : null,
    property.bathrooms ? `${property.bathrooms} bathroom` : null,
  ].filter(Boolean).join(', ');

  const rentPeriod = (property.listing_type === 'rent' || property.listing_type === 'shortlet')
    && txn.rent_start_date && txn.rent_end_date
    ? `\nTenancy Period: ${formatDate(Number(txn.rent_start_date))} to ${formatDate(Number(txn.rent_end_date))}`
    : '';

  const agentBlock = parties.agent_name
    ? `
AGENT
Name:            ${parties.agent_name}
Phone:           ${parties.agent_phone ?? 'N/A'}
ESVARBON Reg No: ${parties.agent_esvarbon_reg_no ?? 'N/A'}`
    : '';

  const text = `
================================================================================
             WEBWAKA REAL ESTATE — PROPERTY ${transactionTypeLabel} AGREEMENT
================================================================================
Contract Reference: ${contractId}
Transaction ID:     ${transactionId}
Date Generated:     ${formatDate(now)}

PARTIES
-------
BUYER / TENANT
Name:    ${parties.buyer_name}
Phone:   ${parties.buyer_phone}
Email:   ${parties.buyer_email ?? 'N/A'}
${agentBlock}

PROPERTY DETAILS
----------------
Title:            ${property.title}
Property Type:    ${propertyDesc}
Address:          ${property.address}
City:             ${property.city}
State:            ${property.state}${property.lga ? `\nLGA:              ${property.lga}` : ''}${rentPeriod}

FINANCIAL SUMMARY (All amounts in Nigerian Naira)
--------------------------------------------------
Agreed Price:     ${koboToNGN(financials.agreed_price_kobo)}
Agency Fee:       ${koboToNGN(financials.agency_fee_kobo)}
Legal Fee:        ${koboToNGN(financials.legal_fee_kobo)}
Caution/Deposit:  ${koboToNGN(financials.caution_fee_kobo)}
─────────────────────────────────────────────────
TOTAL PAYABLE:    ${koboToNGN(financials.total_payable_kobo)}
Amount Paid:      ${koboToNGN(financials.amount_paid_kobo)}
Balance Due:      ${koboToNGN(financials.total_payable_kobo - financials.amount_paid_kobo)}

${txn.notes ? `NOTES\n-----\n${txn.notes}\n` : ''}
TERMS & CONDITIONS
------------------
1. This agreement is subject to the laws of the Federal Republic of Nigeria.
2. The buyer/tenant acknowledges having inspected the property described herein.
3. All payments must be made in full before keys/possession are handed over,
   unless otherwise agreed in writing by both parties.
4. The agent named herein is duly registered with the Estate Surveyors and
   Valuers Registration Board of Nigeria (ESVARBON).
5. This document is generated by WebWaka OS and serves as a preliminary record.
   A formal legal agreement should be executed by a qualified solicitor.

________________________________________________________________________________
BUYER / TENANT SIGNATURE: _________________________  Date: ____________________

AGENT SIGNATURE:          _________________________  Date: ____________________
================================================================================
`.trim();

  return {
    contract_id: contractId,
    transaction_id: transactionId,
    tenant_id: tenantId,
    transaction_type: property.listing_type,
    generated_at: now,
    generated_at_iso: new Date(now).toISOString(),
    parties,
    property,
    financials,
    rent_start_date_iso: rentStartIso,
    rent_end_date_iso: rentEndIso,
    notes: txn.notes as string | null,
    text,
  };
}
