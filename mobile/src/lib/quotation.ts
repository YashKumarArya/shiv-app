import type {
  QuotationCalculation,
  QuotationCostHead,
  QuotationInput,
  QuotationService,
} from '@/api/types';

const MAX_MONEY_MINOR = 9_999_999_999;
const moneyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatMoneyMinor = (value: number) => moneyFormatter.format(value / 100);

/** Parses a human rupee input without a floating-point multiply by 100. */
export const parseMoneyMinor = (value: string) => {
  const normalized = value.trim().replaceAll(',', '');
  const match = /^(\d{1,8})(?:\.(\d{0,2}))?$/.exec(normalized);
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor <= MAX_MONEY_MINOR ? minor : null;
};

export const moneyMinorInput = (minor: number) => (minor / 100).toFixed(2);

export const parsePercentageBps = (value: string) => {
  const match = /^(\d{1,3})(?:\.(\d{0,2}))?$/.exec(value.trim());
  if (!match) return null;
  const basisPoints = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return basisPoints > 0 && basisPoints <= 10_000 ? basisPoints : null;
};

export const percentageInput = (basisPoints: number) => {
  const value = (basisPoints / 100).toFixed(2);
  return value.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
};

/** Client preview of the server's canonical integer-paise calculation. */
export const calculateQuotation = (
  services: readonly QuotationService[],
  costHeads: readonly QuotationCostHead[],
): QuotationCalculation => {
  const totals = Object.fromEntries(services.map((service) => [service.id, service.baseAmountMinor]));
  const rows = costHeads.map((head) => {
    const amountsMinor: Record<string, number | null> = {};
    services.forEach((service) => {
      let amount: number | null;
      if (head.kind === 'percentage') {
        const basis = head.basis === 'base' ? service.baseAmountMinor : totals[service.id];
        amount = Math.round((basis * head.rateBps) / 10_000);
      } else if (head.kind === 'fixed') {
        amount = head.amountsMinor[service.id] ?? 0;
      } else {
        amount = null;
      }
      amountsMinor[service.id] = amount;
      if (amount !== null) totals[service.id] += amount;
    });
    return { costHeadId: head.id, amountsMinor };
  });
  return { version: 1, rows, totalsMinor: totals };
};

export const quotationRecordToInput = (quotation: {
  quotation_date: string;
  valid_until?: string | null;
  title: string;
  client_name: string;
  client_address?: string | null;
  client_gst_number?: string | null;
  client_contact_name?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  services: QuotationService[];
  cost_heads: QuotationCostHead[];
  terms?: string | null;
}): QuotationInput => ({
  quotationDate: quotation.quotation_date.slice(0, 10),
  validUntil: quotation.valid_until?.slice(0, 10) ?? null,
  title: quotation.title,
  clientName: quotation.client_name,
  clientAddress: quotation.client_address,
  clientGstNumber: quotation.client_gst_number,
  clientContactName: quotation.client_contact_name,
  clientPhone: quotation.client_phone,
  clientEmail: quotation.client_email,
  services: quotation.services,
  costHeads: quotation.cost_heads,
  terms: quotation.terms,
});

