import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { numericInput } from '../lib/fields.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { assertCompletedPayrollFinalized, lockPayrollSettingsBasis } from '../lib/payroll.js';
import { uploadReference } from '../lib/uploads.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

// Future app-wide settings join this object.
const schema = z.object({
  salary_exclude_sundays: z.enum(['true', 'false']),
  salary_off_days: numericInput(z.number().int().min(0).max(30)),
  company_name: z.string().max(150),
  company_address: z.string().max(300),
  company_phone: z.string().max(20),
  company_logo: uploadReference.or(z.literal('')),
  company_signature: uploadReference.or(z.literal('')),
}).partial();

const allSettings = async () => {
  const rows = await query<{ key: string; value: string }>(`SELECT key, value FROM app_settings`);
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
};

const router = Router();

router.get('/', asyncHandler(async (_req, res) => res.json(await allSettings())));

router.put('/', requireAdmin, validate(schema), asyncHandler(async (req, res) => {
  const entries = Object.entries(req.body);
  if (!entries.length) throw new HttpError(400, 'No settings to update');

  const settings = await withTransaction(async (tx) => {
    if (entries.some(([key]) => key === 'salary_exclude_sundays' || key === 'salary_off_days')) {
      await lockPayrollSettingsBasis(tx);
      await assertCompletedPayrollFinalized(tx);
    }
    for (const [key, value] of entries) {
      await tx.query(
        `INSERT INTO app_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value],
      );
    }
    const rows = await tx.query<{ key: string; value: string }>(`SELECT key, value FROM app_settings`);
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  });
  res.json(settings);
}));

export default router;
