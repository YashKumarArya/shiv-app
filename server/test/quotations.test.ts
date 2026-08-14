import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateQuotation, quotationInputSchema } from '../src/lib/quotations.js';

test('quotation percentages use integer paise and their selected basis', () => {
  const services = [{ id: 'guard', label: 'Security Guard', baseAmountMinor: 1_300_600 }];
  const heads = [
    { id: 'pf', label: 'PF', kind: 'percentage' as const, rateBps: 1_300, basis: 'base' as const },
    { id: 'esic', label: 'ESIC', kind: 'percentage' as const, rateBps: 325, basis: 'base' as const },
    { id: 'admin', label: 'Admin charges', kind: 'percentage' as const, rateBps: 100, basis: 'base' as const },
    { id: 'service', label: 'Service charges', kind: 'percentage' as const, rateBps: 800, basis: 'base' as const },
    { id: 'gst', label: 'GST', kind: 'percentage' as const, rateBps: 1_800, basis: 'running_subtotal' as const },
  ];

  const result = calculateQuotation(services, heads);

  assert.deepEqual(result.rows.map((row) => row.amountsMinor.guard), [169_078, 42_270, 13_006, 104_048, 293_220]);
  assert.equal(result.totalsMinor.guard, 1_922_222);
});

test('quotation validation rejects duplicate item ids and invalid validity dates', () => {
  const result = quotationInputSchema.safeParse({
    quotationDate: '2026-08-12',
    validUntil: '2026-08-11',
    title: 'Rates',
    clientName: 'Example Client',
    services: [
      { id: 'guard', label: 'Guard', baseAmountMinor: 100_00 },
      { id: 'guard', label: 'Supervisor', baseAmountMinor: 200_00 },
    ],
    costHeads: [],
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'validUntil'));
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'services.1.id'));
  }
});

