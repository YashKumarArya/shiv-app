import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { SALARY_OFF_MODES } from '../lib/payroll.js';
import { asyncHandler } from '../lib/http.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

// Future app-wide settings join this object.
const schema = z.object({
  salary_off_mode: z.enum(SALARY_OFF_MODES),
  company_name: z.string().max(150),
  company_address: z.string().max(300),
  company_phone: z.string().max(20),
  company_logo: z.string().max(300),
}).partial();

const allSettings = async () => {
  const rows = await query<{ key: string; value: string }>(`SELECT key, value FROM app_settings`);
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
};

const router = Router();

router.get('/', asyncHandler(async (_req, res) => res.json(await allSettings())));

router.put('/', requireAdmin, validate(schema), asyncHandler(async (req, res) => {
  for (const [key, value] of Object.entries(req.body)) {
    await query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, value],
    );
  }
  res.json(await allSettings());
}));

export default router;
