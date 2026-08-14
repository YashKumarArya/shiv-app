import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction, type DbExecutor } from '../config/db.js';
import { id as idSchema } from '../lib/fields.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { calculateQuotation, quotationInputSchema, type QuotationInput } from '../lib/quotations.js';
import { parseInput } from '../lib/validation.js';
import { validate } from '../middleware/validate.js';

interface SettingRow { key: string; value: string }

const quotationId = (value: unknown) => parseInput(idSchema, value, 'id');
const searchableListSchema = z.object({
  search: z.string().trim().max(200).optional(),
});

const companySettingKeys = [
  'company_name',
  'company_address',
  'company_phone',
  'company_email',
  'company_gst_number',
  'company_tagline',
  'company_logo',
  'company_signature',
] as const;

const companySnapshot = async (tx: DbExecutor) => {
  const rows = await tx.query<SettingRow>(
    `SELECT key, value FROM app_settings WHERE key = ANY($1::text[])`,
    [companySettingKeys],
  );
  const settings = Object.fromEntries(rows.map(({ key, value }) => [key, value]));
  return {
    name: settings.company_name || 'Company',
    address: settings.company_address || '',
    phone: settings.company_phone || '',
    email: settings.company_email || '',
    gstNumber: settings.company_gst_number || '',
    tagline: settings.company_tagline || '',
    logo: settings.company_logo || '',
    signature: settings.company_signature || '',
  };
};

const insertDraft = async (tx: DbExecutor, input: QuotationInput, userId: number) => {
  const sequence = await tx.queryOne<{ value: string }>(
    `SELECT nextval('quotation_number_seq')::text AS value`,
  );
  if (!sequence) throw new Error('Could not allocate a quotation number');
  const year = input.quotationDate.slice(0, 4);
  const quotationNumber = `QTN-${year}-${sequence.value.padStart(5, '0')}`;
  const calculation = calculateQuotation(input.services, input.costHeads);
  const company = await companySnapshot(tx);

  return tx.queryOne(
    `INSERT INTO quotations (
       quotation_number, quotation_date, valid_until, title,
       client_name, client_address, client_gst_number, client_contact_name,
       client_phone, client_email, services, cost_heads, calculation,
       company_snapshot, terms, created_by
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16
     ) RETURNING *`,
    [
      quotationNumber, input.quotationDate, input.validUntil || null, input.title,
      input.clientName, input.clientAddress || null, input.clientGstNumber || null,
      input.clientContactName || null, input.clientPhone || null, input.clientEmail || null,
      JSON.stringify(input.services), JSON.stringify(input.costHeads), JSON.stringify(calculation),
      JSON.stringify(company), input.terms || null, userId,
    ],
  );
};

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const { search } = parseInput(searchableListSchema, req.query);
  const params: unknown[] = [];
  const where = search
    ? (() => {
        params.push(`%${search}%`);
        return `WHERE quotation_number ILIKE $1 OR client_name ILIKE $1 OR title ILIKE $1`;
      })()
    : '';
  const rows = await query(
    `SELECT id, quotation_number, status, quotation_date, valid_until, title,
            client_name, client_gst_number, issued_at, created_at, updated_at
     FROM quotations ${where}
     ORDER BY quotation_date DESC, id DESC
     LIMIT 200`,
    params,
  );
  res.json(rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const row = await queryOne(`SELECT * FROM quotations WHERE id = $1`, [quotationId(req.params.id)]);
  if (!row) throw new HttpError(404, 'Quotation not found');
  res.json(row);
}));

router.post('/', validate(quotationInputSchema), asyncHandler(async (req, res) => {
  const row = await withTransaction((tx) => insertDraft(tx, req.body, req.user!.id));
  res.status(201).json(row);
}));

router.put('/:id', validate(quotationInputSchema), asyncHandler(async (req, res) => {
  const id = quotationId(req.params.id);
  const input = req.body as QuotationInput;
  const row = await withTransaction(async (tx) => {
    const existing = await tx.queryOne<{ status: string }>(
      `SELECT status FROM quotations WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!existing) throw new HttpError(404, 'Quotation not found');
    if (existing.status !== 'Draft') {
      throw new HttpError(409, 'Issued quotations are immutable; create a new quotation instead');
    }
    const calculation = calculateQuotation(input.services, input.costHeads);
    return tx.queryOne(
      `UPDATE quotations SET
         quotation_date = $1, valid_until = $2, title = $3,
         client_name = $4, client_address = $5, client_gst_number = $6,
         client_contact_name = $7, client_phone = $8, client_email = $9,
         services = $10::jsonb, cost_heads = $11::jsonb, calculation = $12::jsonb,
         terms = $13, updated_at = NOW()
       WHERE id = $14 RETURNING *`,
      [
        input.quotationDate, input.validUntil || null, input.title, input.clientName,
        input.clientAddress || null, input.clientGstNumber || null,
        input.clientContactName || null, input.clientPhone || null, input.clientEmail || null,
        JSON.stringify(input.services), JSON.stringify(input.costHeads), JSON.stringify(calculation),
        input.terms || null, id,
      ],
    );
  });
  res.json(row);
}));

router.post('/:id/issue', asyncHandler(async (req, res) => {
  const id = quotationId(req.params.id);
  const row = await withTransaction(async (tx) => {
    const existing = await tx.queryOne<Record<string, unknown>>(
      `SELECT * FROM quotations WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!existing) throw new HttpError(404, 'Quotation not found');
    // Retried requests are safe. This matters on mobile networks where the
    // first response can be lost after the database has already committed.
    if (existing.status === 'Issued') return existing;
    return tx.queryOne(
      `UPDATE quotations
       SET status = 'Issued', issued_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id],
    );
  });
  res.json(row);
}));

router.post('/:id/duplicate', asyncHandler(async (req, res) => {
  const id = quotationId(req.params.id);
  const row = await withTransaction(async (tx) => {
    const source = await tx.queryOne<Record<string, unknown>>(
      `SELECT * FROM quotations WHERE id = $1 FOR SHARE`,
      [id],
    );
    if (!source) throw new HttpError(404, 'Quotation not found');
    const businessDate = await tx.queryOne<{ value: string }>(`SELECT CURRENT_DATE::text AS value`);
    if (!businessDate) throw new Error('Could not resolve the business date');
    const input = parseInput(quotationInputSchema, {
      quotationDate: businessDate.value,
      validUntil: null,
      title: source.title,
      clientName: source.client_name,
      clientAddress: source.client_address,
      clientGstNumber: source.client_gst_number,
      clientContactName: source.client_contact_name,
      clientPhone: source.client_phone,
      clientEmail: source.client_email,
      services: source.services,
      costHeads: source.cost_heads,
      terms: source.terms,
    });
    return insertDraft(tx, input, req.user!.id);
  });
  res.status(201).json(row);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = quotationId(req.params.id);
  const row = await queryOne(
    `DELETE FROM quotations WHERE id = $1 AND status = 'Draft' RETURNING id`,
    [id],
  );
  if (!row) {
    const exists = await queryOne(`SELECT id FROM quotations WHERE id = $1`, [id]);
    if (exists) throw new HttpError(409, 'Issued quotations cannot be deleted');
    throw new HttpError(404, 'Quotation not found');
  }
  res.status(204).end();
}));

export default router;
