import { z } from 'zod';
import { crudRouter } from '../lib/crud.js';
import { dateString, id, money } from '../lib/fields.js';

const schema = z.object({
  employee_id: id,
  payment_month: z.coerce.number().int().min(1).max(12),
  payment_year: z.coerce.number().int().min(2000),
  amount: money,
  payment_date: dateString.optional(),
  payment_mode: z.enum(['Cash', 'Bank Transfer', 'UPI']).optional(),
  transaction_reference: z.string().optional(),
  payment_proof: z.string().optional(),
  remarks: z.string().optional(),
});

export default crudRouter({
  table: 'payments',
  createSchema: schema,
  updateSchema: schema.partial(),
  filterColumns: ['employee_id', 'payment_month', 'payment_year'],
  orderBy: 'payments.payment_year DESC, payments.payment_month DESC, payments.id DESC',
  listQuery: `SELECT payments.*, employees.first_name, employees.last_name, employees.employee_code
              FROM payments JOIN employees ON employees.id = payments.employee_id`,
  beforeCreate: (body, req) => ({ ...body, created_by: req.user!.id }),
});
