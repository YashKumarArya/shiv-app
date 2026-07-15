import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/db.js';
import { crudRouter } from '../lib/crud.js';
import { dateString, id, money } from '../lib/fields.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { getSalaryOffMode, payableDays, type SalaryOffMode } from '../lib/payroll.js';

const schema = z.object({
  employee_id: id,
  payment_month: z.coerce.number().int().min(1).max(12),
  payment_year: z.coerce.number().int().min(2000),
  amount: money.refine((value) => value > 0, 'amount must be greater than zero'),
  payment_date: dateString.nullable().optional(),
  payment_mode: z.enum(['Cash', 'Bank Transfer', 'UPI']).nullable().optional(),
  transaction_reference: z.string().nullable().optional(),
  payment_proof: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
});

const trackingQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  employee_id: z.coerce.number().int().positive().optional(),
});

type PaymentTrackingStatus = 'Paid' | 'Partial' | 'Due' | 'Not Set';

interface PaymentTrackingRow {
  employee_id: number;
  employee_code: string;
  first_name: string;
  last_name: string | null;
  photo: string | null;
  designation_id: number;
  designation_name: string;
  employee_salary: number | null;
  default_salary: number | null;
  effective_salary: number;
  worked_days: number;
  payable_days: number;
  per_day_rate: number;
  due_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: PaymentTrackingStatus;
  payment_count: number;
  payment: {
    id: number;
    employee_id: number;
    payment_month: number;
    payment_year: number;
    amount: number;
    payment_date: string | null;
    payment_mode: 'Cash' | 'Bank Transfer' | 'UPI' | null;
    transaction_reference: string | null;
    payment_proof: string | null;
    remarks: string | null;
    created_by: number | null;
    created_at: string;
    updated_at: string;
  } | null;
}

const router = Router();

interface PaymentContext {
  employee_id: number;
  payment_month: number;
  payment_year: number;
  amount: number;
}

const validatePaymentTotal = async (body: Record<string, unknown>, paymentId?: string) => {
  const existing = paymentId
    ? await queryOne<PaymentContext>(
        `SELECT employee_id, payment_month, payment_year, amount::float AS amount
         FROM payments WHERE id = $1`,
        [paymentId],
      )
    : null;
  if (paymentId && !existing) throw new HttpError(404, 'Payment not found');

  const employeeId = Number(body.employee_id ?? existing?.employee_id);
  const month = Number(body.payment_month ?? existing?.payment_month);
  const year = Number(body.payment_year ?? existing?.payment_year);
  const amount = Number(body.amount ?? existing?.amount);
  const salary = await queryOne<{ salary: number | null }>(
    `SELECT COALESCE(e.salary, d.default_salary)::float AS salary
     FROM employees e JOIN designations d ON d.id = e.designation_id
     WHERE e.id = $1`,
    [employeeId],
  );
  if (!salary) throw new HttpError(404, 'Employee not found');
  if (salary.salary == null) throw new HttpError(409, 'Set the employee salary before recording a payment');

  // Pay is earned per attendance day: salary / payable days × days worked so far.
  const worked = await queryOne<{ worked: number }>(
    `SELECT COALESCE(SUM(CASE WHEN status = 'Present' THEN 1 WHEN status = 'Half Day' THEN 0.5 ELSE 0 END), 0)::float AS worked
     FROM attendance
     WHERE employee_id = $1
       AND attendance_date >= make_date($2, $3, 1)
       AND attendance_date < make_date($2, $3, 1) + INTERVAL '1 month'`,
    [employeeId, year, month],
  );
  const perDay = salary.salary / payableDays(year, month, await getSalaryOffMode());
  const earned = Math.round(perDay * (worked?.worked ?? 0) * 100) / 100;

  const totals = await queryOne<{ paid: number }>(
    `SELECT COALESCE(SUM(amount), 0)::float AS paid
     FROM payments
     WHERE employee_id = $1 AND payment_month = $2 AND payment_year = $3
       AND ($4::int IS NULL OR id <> $4)`,
    [employeeId, month, year, paymentId ? Number(paymentId) : null],
  );
  if ((totals?.paid ?? 0) + amount > earned) {
    const remaining = Math.max(earned - (totals?.paid ?? 0), 0);
    throw new HttpError(
      409,
      `Payment exceeds salary earned from attendance (${(worked?.worked ?? 0)} days worked, ${remaining.toFixed(2)} remaining)`,
    );
  }
  return body;
};

router.get('/tracking', asyncHandler(async (req, res) => {
  const parsed = trackingQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new HttpError(400, message);
  }

  const { month, year, employee_id: employeeId } = parsed.data;
  const offMode = await getSalaryOffMode();
  const payable = payableDays(year, month, offMode);
  const employees = await query<PaymentTrackingRow>(
    `SELECT e.id AS employee_id, e.employee_code, e.first_name, e.last_name, e.photo,
            d.id AS designation_id, d.designation_name,
            e.salary::float AS employee_salary, d.default_salary::float AS default_salary,
            COALESCE(e.salary, d.default_salary, 0)::float AS effective_salary,
            att.worked_days,
            $4::float AS payable_days,
            ROUND(COALESCE(e.salary, d.default_salary, 0)::numeric / $4::numeric, 2)::float AS per_day_rate,
            pay.due AS due_amount,
            COALESCE(payment_totals.paid_amount, 0)::float AS paid_amount,
            GREATEST(pay.due - COALESCE(payment_totals.paid_amount, 0)::float, 0) AS remaining_amount,
            CASE
              WHEN e.salary IS NULL AND d.default_salary IS NULL THEN 'Not Set'
              WHEN pay.due > 0 AND COALESCE(payment_totals.paid_amount, 0) >= pay.due THEN 'Paid'
              WHEN COALESCE(payment_totals.paid_amount, 0) > 0 THEN 'Partial'
              ELSE 'Due'
            END AS status,
            COALESCE(payment_totals.payment_count, 0)::int AS payment_count,
            latest_payment.payment
     FROM employees e
     JOIN designations d ON d.id = e.designation_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(CASE WHEN a.status = 'Present' THEN 1 WHEN a.status = 'Half Day' THEN 0.5 ELSE 0 END), 0)::float AS worked_days
       FROM attendance a
       WHERE a.employee_id = e.id
         AND a.attendance_date >= make_date($2, $1, 1)
         AND a.attendance_date < make_date($2, $1, 1) + INTERVAL '1 month'
     ) att ON TRUE
     LEFT JOIN LATERAL (
       SELECT ROUND(COALESCE(e.salary, d.default_salary, 0)::numeric * att.worked_days::numeric / $4::numeric, 2)::float AS due
     ) pay ON TRUE
     LEFT JOIN LATERAL (
       SELECT SUM(p.amount)::float AS paid_amount, COUNT(*)::int AS payment_count
       FROM payments p
       WHERE p.employee_id = e.id
         AND p.payment_month = $1
         AND p.payment_year = $2
     ) payment_totals ON TRUE
     LEFT JOIN LATERAL (
       SELECT json_build_object(
         'id', p.id,
         'employee_id', p.employee_id,
         'payment_month', p.payment_month,
         'payment_year', p.payment_year,
         'amount', p.amount::float,
         'payment_date', to_char(p.payment_date, 'YYYY-MM-DD'),
         'payment_mode', p.payment_mode,
         'transaction_reference', p.transaction_reference,
         'payment_proof', p.payment_proof,
         'remarks', p.remarks,
         'created_by', p.created_by,
         'created_at', p.created_at,
         'updated_at', p.updated_at
       ) AS payment
       FROM payments p
       WHERE p.employee_id = e.id
         AND p.payment_month = $1
         AND p.payment_year = $2
       ORDER BY p.payment_date DESC NULLS LAST, p.id DESC
       LIMIT 1
     ) latest_payment ON TRUE
     WHERE (e.status = 'Active'
       OR ($3::int IS NOT NULL AND e.id = $3)
       OR COALESCE(payment_totals.payment_count, 0) > 0)
       AND e.joining_date < (make_date($2, $1, 1) + INTERVAL '1 month')
     ORDER BY e.first_name, e.last_name, e.employee_code`,
    [month, year, employeeId ?? null, payable],
  );

  const summary = employees.reduce(
    (totals, employee) => {
      totals.total_payroll += employee.due_amount;
      totals.total_paid += employee.paid_amount;
      totals.total_remaining += employee.remaining_amount;
      if (employee.status === 'Paid') totals.paid_count += 1;
      if (employee.status === 'Partial') totals.partial_count += 1;
      if (employee.status === 'Due') totals.due_count += 1;
      if (employee.status === 'Not Set') totals.not_set_count += 1;
      return totals;
    },
    {
      total_payroll: 0,
      total_paid: 0,
      total_remaining: 0,
      paid_count: 0,
      partial_count: 0,
      due_count: 0,
      not_set_count: 0,
    },
  );

  res.json({ month, year, salary_off_mode: offMode, payable_days: payable, employees, summary });
}));

router.use(crudRouter({
  table: 'payments',
  createSchema: schema,
  updateSchema: schema.partial(),
  filterColumns: ['employee_id', 'payment_month', 'payment_year'],
  orderBy: 'payments.payment_year DESC, payments.payment_month DESC, payments.id DESC',
  listQuery: `SELECT payments.*, employees.first_name, employees.last_name, employees.employee_code
              FROM payments JOIN employees ON employees.id = payments.employee_id`,
  beforeCreate: async (body, req) => ({
    ...await validatePaymentTotal(body),
    created_by: req.user!.id,
  }),
  beforeUpdate: (body, _req, paymentId) => validatePaymentTotal(body, paymentId),
}));

export default router;
