import { z } from 'zod';
import { dateString } from './fields.js';

const MAX_MONEY_MINOR = 9_999_999_999;
const itemId = z.string().trim().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/);
const moneyMinor = z.number().int().nonnegative().max(MAX_MONEY_MINOR);
const serviceValueMap = <T extends z.ZodTypeAny>(value: T) => z.record(itemId, value);

export const quotationServiceSchema = z.object({
  id: itemId,
  label: z.string().trim().min(1).max(60),
  baseAmountMinor: moneyMinor,
});

const percentageCostHeadSchema = z.object({
  id: itemId,
  label: z.string().trim().min(1).max(80),
  kind: z.literal('percentage'),
  rateBps: z.number().int().positive().max(10_000),
  basis: z.enum(['base', 'running_subtotal']),
});

const fixedCostHeadSchema = z.object({
  id: itemId,
  label: z.string().trim().min(1).max(80),
  kind: z.literal('fixed'),
  amountsMinor: serviceValueMap(moneyMinor),
});

const textCostHeadSchema = z.object({
  id: itemId,
  label: z.string().trim().min(1).max(80),
  kind: z.literal('text'),
  values: serviceValueMap(z.string().trim().max(80)),
});

export const quotationCostHeadSchema = z.discriminatedUnion('kind', [
  percentageCostHeadSchema,
  fixedCostHeadSchema,
  textCostHeadSchema,
]);

const optionalText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();

export const quotationInputSchema = z.object({
  quotationDate: dateString,
  validUntil: dateString.nullable().optional(),
  title: z.string().trim().min(1).max(120),
  clientName: z.string().trim().min(1).max(150),
  clientAddress: optionalText(500),
  clientGstNumber: optionalText(30),
  clientContactName: optionalText(120),
  clientPhone: optionalText(30),
  clientEmail: z.string().trim().email().max(200).nullable().optional().or(z.literal('')),
  services: z.array(quotationServiceSchema).min(1).max(8),
  costHeads: z.array(quotationCostHeadSchema).max(30),
  terms: optionalText(4_000),
}).superRefine((quotation, context) => {
  if (quotation.validUntil && quotation.validUntil < quotation.quotationDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['validUntil'],
      message: 'must be on or after quotationDate',
    });
  }

  const serviceIds = new Set<string>();
  quotation.services.forEach((service, index) => {
    if (serviceIds.has(service.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['services', index, 'id'],
        message: 'must be unique',
      });
    }
    serviceIds.add(service.id);
  });

  const costHeadIds = new Set<string>();
  quotation.costHeads.forEach((head, index) => {
    if (costHeadIds.has(head.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['costHeads', index, 'id'],
        message: 'must be unique',
      });
    }
    costHeadIds.add(head.id);

    const suppliedIds = head.kind === 'fixed'
      ? Object.keys(head.amountsMinor)
      : head.kind === 'text'
        ? Object.keys(head.values)
        : [];
    suppliedIds.forEach((serviceId) => {
      if (!serviceIds.has(serviceId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['costHeads', index],
          message: `references unknown service "${serviceId}"`,
        });
      }
    });
  });
});

export type QuotationInput = z.infer<typeof quotationInputSchema>;
export type QuotationService = z.infer<typeof quotationServiceSchema>;
export type QuotationCostHead = z.infer<typeof quotationCostHeadSchema>;

export interface QuotationCalculationRow {
  costHeadId: string;
  amountsMinor: Record<string, number | null>;
}

export interface QuotationCalculation {
  version: 1;
  rows: QuotationCalculationRow[];
  totalsMinor: Record<string, number>;
}

/**
 * Calculates every monetary cell using integer paise and basis points. This is
 * the canonical server implementation; clients may preview the same formula,
 * but only these results are persisted in the quotation snapshot.
 */
export const calculateQuotation = (
  services: readonly QuotationService[],
  costHeads: readonly QuotationCostHead[],
): QuotationCalculation => {
  const servicesById = new Map(services.map((service) => [service.id, service]));
  const runningTotals = Object.fromEntries(
    services.map((service) => [service.id, service.baseAmountMinor]),
  ) as Record<string, number>;

  const rows = costHeads.map((head): QuotationCalculationRow => {
    const amountsMinor: Record<string, number | null> = {};
    for (const service of services) {
      let amount: number | null;
      if (head.kind === 'percentage') {
        const basis = head.basis === 'base'
          ? service.baseAmountMinor
          : runningTotals[service.id];
        amount = Math.round((basis * head.rateBps) / 10_000);
      } else if (head.kind === 'fixed') {
        amount = head.amountsMinor[service.id] ?? 0;
      } else {
        amount = null;
      }

      amountsMinor[service.id] = amount;
      if (amount !== null) {
        const nextTotal = runningTotals[service.id] + amount;
        if (!Number.isSafeInteger(nextTotal) || nextTotal > MAX_MONEY_MINOR) {
          throw new Error(`Quotation total is too large for ${servicesById.get(service.id)?.label ?? service.id}`);
        }
        runningTotals[service.id] = nextTotal;
      }
    }
    return { costHeadId: head.id, amountsMinor };
  });

  return { version: 1, rows, totalsMinor: runningTotals };
};

