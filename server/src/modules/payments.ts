import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction, type DbExecutor } from '../config/db.js';
import { crudRouter } from '../lib/crud.js';
import { dateString, id, money, numericInput } from '../lib/fields.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import {
  finalizePayrollSnapshots,
  getSalarySettings,
  payableDays,
  payrollPeriodState,
} from '../lib/payroll.js';
import { uploadReference } from '../lib/uploads.js';
import { parseInput } from '../lib/validation.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const schema = z.object({
  employee_id: id,
  payment_month: numericInput(z.number().int().min(1).max(12)),
  payment_year: numericInput(z.number().int().min(2000).max(2100)),
  amount: money.refine((value) => value > 0, 'amount must be greater than zero'),
  payment_date: dateString.nullable().optional(),
  payment_mode: z.enum(['Cash', 'Bank Transfer', 'UPI']).nullable().optional(),
  transaction_reference: z.string().nullable().optional(),
  payment_proof: uploadReference.nullable().optional(),
  remarks: z.string().nullable().optional(),
  idempotency_key: z.string().trim().min(16).max(100).regex(/^[A-Za-z0-9._:-]+$/).optional(),
});

const trackingQuerySchema = z.object({
  month: numericInput(z.number().int().min(1).max(12)),
  year: numericInput(z.number().int().min(2000).max(2100)),
  employee_id: numericInput(z.number().int().positive()).optional(),
});

const reversalSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  reversal_date: dateString.optional(),
});

type PaymentTrackingStatus = 'Paid' | 'Partial' | 'Due' | 'Advance' | 'Not Set';

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
  advance_amount: number;
  has_earnings: boolean;
  status: PaymentTrackingStatus;
  payment_count: number;
  payroll_finalized: boolean;
  payroll_finalized_at: string | null;
  payroll_finalization_reason: string | null;
  payroll_snapshot_estimated: boolean;
  payroll_approved: boolean;
  payroll_approved_at: string | null;
  payroll_approval_source: 'manual' | 'migration' | null;
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
    entry_type: 'payment' | 'reversal';
    reverses_payment_id: number | null;
    reversal_reason: string | null;
  } | null;
}

const router = Router();

const toCents = (amount: number) => Math.round(amount * 100);

const validatePaymentTotal = async (
  body: Record<string, unknown>,
  tx: DbExecutor,
) => {
  const employeeId = Number(body.employee_id);
  const month = Number(body.payment_month);
  const year = Number(body.payment_year);
  const amount = Number(body.amount);
  if (body.payment_date) {
    const invalidDate = await tx.queryOne<{ is_future: boolean }>(
      `SELECT $1::date > CURRENT_DATE AS is_future`,
      [body.payment_date],
    );
    if (invalidDate?.is_future) throw new HttpError(409, 'A payment date cannot be in the future');
  }
  const employee = await tx.queryOne<{ id: number; joining_date: string }>(
    `SELECT id, to_char(joining_date, 'YYYY-MM-DD') AS joining_date
     FROM employees WHERE id = $1 FOR UPDATE`,
    [employeeId],
  );
  if (!employee) throw new HttpError(404, 'Employee not found');
  if (body.payment_date && String(body.payment_date) < employee.joining_date) {
    throw new HttpError(409, 'A payment date cannot be before the employee joining date');
  }
  const periodState = await payrollPeriodState(year, month, tx);
  if (periodState === 'future') throw new HttpError(409, 'A payment cannot be recorded for a future payroll period');
  if (periodState === 'past') {
    const approval = await tx.queryOne<{ id: number }>(
      `SELECT ppa.id
       FROM payroll_period_approvals ppa
       WHERE ppa.employee_id = $1 AND ppa.payment_month = $2 AND ppa.payment_year = $3`,
      [employeeId, month, year],
    );
    if (!approval) {
      throw new HttpError(409, 'An administrator must finalize this historical payroll before recording a payment');
    }
  }

  const salary = await tx.queryOne<{ salary: number | null; joining_month: string; payroll_finalized: boolean }>(
    `SELECT CASE WHEN ps.id IS NOT NULL THEN ps.effective_salary::float
                 ELSE COALESCE(e.salary, d.default_salary)::float END AS salary,
            to_char(e.joining_date, 'YYYY-MM') AS joining_month,
            (ps.id IS NOT NULL) AS payroll_finalized
     FROM employees e JOIN designations d ON d.id = e.designation_id
     LEFT JOIN payroll_snapshots ps
       ON ps.employee_id = e.id AND ps.payment_month = $2 AND ps.payment_year = $3
     WHERE e.id = $1
     FOR UPDATE OF e`,
    [employeeId, month, year],
  );
  if (!salary) throw new HttpError(404, 'Employee not found');
  if (salary.salary == null) throw new HttpError(409, 'Set the employee salary before recording a payment');
  const paymentMonth = `${year}-${String(month).padStart(2, '0')}`;
  if (!salary.payroll_finalized && paymentMonth < salary.joining_month) {
    throw new HttpError(409, 'A salary payment cannot be recorded before the employee joining month');
  }

  // Paying beyond attendance-earned pay is allowed (tracked as advance),
  // but never beyond the full monthly salary.
  const totals = await tx.queryOne<{ paid: number }>(
    `SELECT COALESCE(SUM(CASE WHEN entry_type = 'reversal' THEN -amount ELSE amount END), 0)::float AS paid
     FROM payments
     WHERE employee_id = $1 AND payment_month = $2 AND payment_year = $3`,
    [employeeId, month, year],
  );
  const paid = totals?.paid ?? 0;
  if (toCents(paid) + toCents(amount) > toCents(salary.salary)) {
    const remaining = Math.max(salary.salary - paid, 0);
    throw new HttpError(409, `Payment exceeds the monthly salary (${remaining.toFixed(2)} can still be paid)`);
  }
  return body;
};

router.post('/tracking/finalize', requireAdmin, validate(trackingQuerySchema), asyncHandler(async (req, res) => {
  const { month, year, employee_id: employeeId } = parseInput(trackingQuerySchema, req.body);
  const result = await withTransaction(async (tx) => {
    const snapshots = await finalizePayrollSnapshots(tx, {
      month,
      year,
      employeeId,
      finalizedBy: req.user!.id,
      reason: 'manual',
    });
    const approvals = await tx.query<{ id: number }>(
      `INSERT INTO payroll_period_approvals (
         payroll_snapshot_id, employee_id, payment_month, payment_year,
         approval_source, approved_by
       )
       SELECT ps.id, ps.employee_id, ps.payment_month, ps.payment_year, 'manual', $4
       FROM payroll_snapshots ps
       WHERE ps.payment_month = $1 AND ps.payment_year = $2
         AND ($3::int IS NULL OR ps.employee_id = $3)
       ON CONFLICT (employee_id, payment_year, payment_month) DO NOTHING
       RETURNING id`,
      [month, year, employeeId ?? null, req.user!.id],
    );
    return { snapshotsCreated: snapshots.length, approvalsCreated: approvals.length };
  });
  res.status(201).json({
    month,
    year,
    employee_id: employeeId ?? null,
    snapshots_created: result.snapshotsCreated,
    approvals_created: result.approvalsCreated,
  });
}));

router.get('/tracking', asyncHandler(async (req, res) => {
  const { month, year, employee_id: employeeId } = parseInput(trackingQuerySchema, req.query);
  const periodState = await payrollPeriodState(year, month);
  if (periodState === 'future') throw new HttpError(400, 'A future payroll period is not available');

  const salarySettings = await getSalarySettings();
  const payable = payableDays(year, month, salarySettings);
  const employees = await query<PaymentTrackingRow>(
    `SELECT e.id AS employee_id, e.employee_code, e.first_name, e.last_name, e.photo,
            basis.designation_id, basis.designation_name,
            basis.employee_salary::float AS employee_salary,
            basis.designation_salary::float AS default_salary,
            COALESCE(basis.effective_salary, 0)::float AS effective_salary,
            basis.worked_days::float AS worked_days,
            basis.payable_days::float AS payable_days,
            ROUND(COALESCE(basis.effective_salary, 0)::numeric / basis.payable_days::numeric, 2)::float AS per_day_rate,
            basis.due_amount::float AS due_amount,
            COALESCE(payment_totals.paid_amount, 0)::float AS paid_amount,
            GREATEST(basis.due_amount - COALESCE(payment_totals.paid_amount, 0), 0)::float AS remaining_amount,
            GREATEST(COALESCE(payment_totals.paid_amount, 0) - basis.due_amount, 0)::float AS advance_amount,
            (basis.due_amount > 0) AS has_earnings,
            CASE
              WHEN basis.effective_salary IS NULL THEN 'Not Set'
              WHEN COALESCE(payment_totals.paid_amount, 0) > basis.due_amount THEN 'Advance'
              WHEN basis.due_amount = 0 THEN 'Paid'
              WHEN basis.due_amount > 0 AND COALESCE(payment_totals.paid_amount, 0) >= basis.due_amount THEN 'Paid'
              WHEN COALESCE(payment_totals.paid_amount, 0) > 0 THEN 'Partial'
              ELSE 'Due'
            END AS status,
            COALESCE(payment_totals.payment_count, 0)::int AS payment_count,
            (ps.id IS NOT NULL) AS payroll_finalized,
            ps.finalized_at AS payroll_finalized_at,
            ps.finalization_reason AS payroll_finalization_reason,
            COALESCE(ps.finalization_reason = 'migration', FALSE) AS payroll_snapshot_estimated,
            (ppa.id IS NOT NULL) AS payroll_approved,
            ppa.approved_at AS payroll_approved_at,
            ppa.approval_source AS payroll_approval_source,
            latest_payment.payment
     FROM employees e
     JOIN designations d ON d.id = e.designation_id
     LEFT JOIN payroll_snapshots ps
       ON ps.employee_id = e.id AND ps.payment_month = $1 AND ps.payment_year = $2
     LEFT JOIN payroll_period_approvals ppa ON ppa.payroll_snapshot_id = ps.id
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(
         CASE WHEN a.status = 'Present' THEN 1::numeric
              WHEN a.status = 'Half Day' THEN 0.5::numeric
              ELSE 0::numeric END
       ), 0)::numeric AS worked_days
       FROM attendance a
       WHERE a.employee_id = e.id
         AND a.attendance_date >= make_date($2, $1, 1)
         AND a.attendance_date < make_date($2, $1, 1) + INTERVAL '1 month'
     ) att ON TRUE
     LEFT JOIN LATERAL (
       SELECT
         CASE WHEN ps.id IS NULL THEN d.id ELSE ps.designation_id END AS designation_id,
         CASE WHEN ps.id IS NULL THEN d.designation_name ELSE ps.designation_name END AS designation_name,
         CASE WHEN ps.id IS NULL THEN e.salary ELSE ps.employee_salary END AS employee_salary,
         CASE WHEN ps.id IS NULL THEN d.default_salary ELSE ps.designation_salary END AS designation_salary,
         CASE WHEN ps.id IS NULL THEN COALESCE(e.salary, d.default_salary) ELSE ps.effective_salary END AS effective_salary,
         CASE WHEN ps.id IS NULL THEN att.worked_days ELSE ps.worked_days END AS worked_days,
         CASE WHEN ps.id IS NULL THEN $4::int ELSE ps.payable_days END AS payable_days,
         CASE WHEN ps.id IS NULL THEN
           CASE WHEN COALESCE(e.salary, d.default_salary) IS NULL THEN 0::numeric
                ELSE LEAST(
                  COALESCE(e.salary, d.default_salary)::numeric,
                  ROUND(COALESCE(e.salary, d.default_salary)::numeric * att.worked_days / $4::numeric, 2)
                ) END
           ELSE ps.due_amount
         END AS due_amount
     ) basis ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(
                CASE WHEN p.entry_type = 'reversal' THEN -p.amount ELSE p.amount END
              ), 0)::numeric AS paid_amount,
              COUNT(*) FILTER (
                WHERE p.entry_type = 'payment'
                  AND NOT EXISTS (SELECT 1 FROM payments r WHERE r.reverses_payment_id = p.id)
              )::int AS payment_count,
              COUNT(*)::int AS ledger_entry_count
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
         'amount', (CASE WHEN p.entry_type = 'reversal' THEN -p.amount ELSE p.amount END)::float,
         'payment_date', to_char(p.payment_date, 'YYYY-MM-DD'),
         'payment_mode', p.payment_mode,
         'transaction_reference', p.transaction_reference,
         'payment_proof', p.payment_proof,
         'remarks', p.remarks,
         'created_by', p.created_by,
         'created_at', p.created_at,
         'updated_at', p.updated_at,
         'entry_type', p.entry_type,
         'reverses_payment_id', p.reverses_payment_id,
         'reversal_reason', p.reversal_reason
       ) AS payment
       FROM payments p
       WHERE p.employee_id = e.id
         AND p.payment_month = $1
         AND p.payment_year = $2
       ORDER BY p.payment_date DESC NULLS LAST, p.id DESC
       LIMIT 1
     ) latest_payment ON TRUE
     WHERE (e.status = 'Active'
       OR basis.worked_days > 0
       OR COALESCE(payment_totals.ledger_entry_count, 0) > 0
       OR ($3::int IS NOT NULL AND e.id = $3))
       AND ($3::int IS NULL OR e.id = $3)
       AND (ps.id IS NOT NULL OR e.joining_date < (make_date($2, $1, 1) + INTERVAL '1 month'))
     ORDER BY e.first_name, e.last_name, e.employee_code`,
    [month, year, employeeId ?? null, payable],
  );

  const summary = employees.reduce(
    (totals, employee) => {
      totals.total_payroll += employee.due_amount;
      totals.total_paid += employee.paid_amount;
      totals.total_remaining += employee.remaining_amount;
      totals.total_advance += employee.advance_amount;
      if (!employee.has_earnings && employee.paid_amount <= 0 && employee.status !== 'Not Set') {
        // Keep Paid in the legacy wire enum/count so older EAS bundles remain safe.
        totals.no_earnings_count += 1;
        totals.paid_count += 1;
      } else if (employee.status === 'Paid') totals.paid_count += 1;
      else if (employee.status === 'Partial') totals.partial_count += 1;
      else if (employee.status === 'Due') totals.due_count += 1;
      else if (employee.status === 'Advance') totals.advance_count += 1;
      else if (employee.status === 'Not Set') totals.not_set_count += 1;
      return totals;
    },
    {
      total_payroll: 0,
      total_paid: 0,
      total_remaining: 0,
      total_advance: 0,
      paid_count: 0,
      partial_count: 0,
      due_count: 0,
      advance_count: 0,
      no_earnings_count: 0,
      not_set_count: 0,
    },
  );

  res.json({
    month, year,
    period_state: periodState,
    payroll_finalized: employees.length > 0 && employees.every((employee) => employee.payroll_finalized),
    payroll_approved: employees.length > 0 && employees.every((employee) => employee.payroll_approved),
    finalized_employee_count: employees.filter((employee) => employee.payroll_finalized).length,
    approved_employee_count: employees.filter((employee) => employee.payroll_approved).length,
    estimated_snapshot_count: employees.filter((employee) => employee.payroll_snapshot_estimated).length,
    open_employee_count: employees.filter((employee) => !employee.payroll_finalized).length,
    salary_exclude_sundays: salarySettings.excludeSundays,
    salary_off_days: salarySettings.extraDays,
    payable_days: payable,
    employees, summary,
  });
}));

router.post('/', validate(schema), asyncHandler(async (req, res) => {
  const result = await withTransaction(async (tx) => {
    const idempotencyKey = req.body.idempotency_key as string | undefined;
    if (idempotencyKey) {
      const actorKey = `${req.user!.id}:${idempotencyKey}`;
      await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [actorKey]);
      const existing = await tx.queryOne<Record<string, unknown>>(
        `SELECT *, amount::float AS amount, to_char(payment_date, 'YYYY-MM-DD') AS payment_date
         FROM payments
         WHERE created_by = $1 AND idempotency_key = $2 AND entry_type = 'payment'`,
        [req.user!.id, idempotencyKey],
      );
      if (existing) {
        const sameInteger = (field: string) => Number(existing[field]) === Number(req.body[field]);
        const sameNullable = (field: string) => (existing[field] ?? null) === (req.body[field] ?? null);
        const identical = ['employee_id', 'payment_month', 'payment_year'].every(sameInteger)
          && toCents(Number(existing.amount)) === toCents(Number(req.body.amount))
          && ['payment_date', 'payment_mode', 'transaction_reference', 'payment_proof', 'remarks']
            .every(sameNullable);
        if (!identical) {
          throw new HttpError(409, 'This payment request key was already used with different details');
        }
        return { row: existing, replayed: true };
      }
    }

    const body: Record<string, unknown> = {
      ...await validatePaymentTotal(req.body, tx),
      created_by: req.user!.id,
      entry_type: 'payment',
    };
    const keys = Object.keys(body);
    const row = await tx.queryOne(
      `INSERT INTO payments (${keys.join(', ')})
       VALUES (${keys.map((_, index) => `$${index + 1}`).join(', ')})
       RETURNING *`,
      keys.map((key) => body[key]),
    );
    return { row, replayed: false };
  });
  if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
  res.status(result.replayed ? 200 : 201).json(result.row);
}));

router.post('/:id/reverse', requireAdmin, validate(reversalSchema), asyncHandler(async (req, res) => {
  const paymentId = parseInput(id, req.params.id, 'id');
  const { reason, reversal_date: reversalDate } = parseInput(reversalSchema, req.body);
  const result = await withTransaction(async (tx) => {
    const original = await tx.queryOne<{
      id: number;
      employee_id: number;
      payment_month: number;
      payment_year: number;
      amount: number;
      payment_date: string | null;
      entry_type: 'payment' | 'reversal';
    }>(
      `SELECT id, employee_id, payment_month, payment_year, amount::float AS amount,
              to_char(payment_date, 'YYYY-MM-DD') AS payment_date, entry_type
       FROM payments WHERE id = $1 FOR UPDATE`,
      [paymentId],
    );
    if (!original) throw new HttpError(404, 'Payment not found');
    if (original.entry_type !== 'payment') throw new HttpError(409, 'A reversal entry cannot be reversed');

    if (reversalDate) {
      const dateCheck = await tx.queryOne<{ is_future: boolean; before_original: boolean }>(
        `SELECT $1::date > CURRENT_DATE AS is_future,
                ($2::date IS NOT NULL AND $1::date < $2::date) AS before_original`,
        [reversalDate, original.payment_date],
      );
      if (dateCheck?.is_future) throw new HttpError(409, 'A reversal date cannot be in the future');
      if (dateCheck?.before_original) throw new HttpError(409, 'A reversal date cannot be before the original payment');
    }

    const alreadyReversed = await tx.queryOne<Record<string, unknown>>(
      `SELECT *, (-amount)::float AS signed_amount
       FROM payments WHERE reverses_payment_id = $1`,
      [paymentId],
    );
    if (alreadyReversed) {
      if (alreadyReversed.reversal_reason !== reason) {
        throw new HttpError(409, 'This payment was already reversed with a different reason');
      }
      if (Number(alreadyReversed.created_by) !== req.user!.id) {
        throw new HttpError(409, 'This payment was already reversed by another administrator');
      }
      return { row: alreadyReversed, replayed: true };
    }

    const row = await tx.queryOne(
      `INSERT INTO payments (
         employee_id, payment_month, payment_year, amount, payment_date,
         transaction_reference, remarks, created_by, entry_type,
         reverses_payment_id, reversal_reason
       ) VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6, $7, $8, 'reversal', $9, $10)
       RETURNING *, (-amount)::float AS signed_amount`,
      [
        original.employee_id,
        original.payment_month,
        original.payment_year,
        original.amount,
        reversalDate ?? null,
        `REVERSAL-${paymentId}`,
        `Reversal of payment #${paymentId}`,
        req.user!.id,
        paymentId,
        reason,
      ],
    );
    return { row, replayed: false };
  });
  if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
  res.status(result.replayed ? 200 : 201).json(result.row);
}));

router.get('/:id/audit', requireAdmin, asyncHandler(async (req, res) => {
  const paymentId = parseInput(id, req.params.id, 'id');
  const exists = await query<{ id: number }>(`SELECT id FROM payments WHERE id = $1`, [paymentId]);
  if (!exists.length) throw new HttpError(404, 'Payment not found');
  const events = await query(
    `SELECT pal.id, pal.payment_id, pal.action, pal.actor_user_id,
            u.name AS actor_name, pal.metadata, pal.created_at
     FROM payment_audit_log pal
     LEFT JOIN app_users u ON u.id = pal.actor_user_id
     WHERE pal.payment_id = $1
        OR (pal.metadata->>'reverses_payment_id')::int = $1
     ORDER BY pal.created_at, pal.id`,
    [paymentId],
  );
  res.json(events);
}));

router.use(crudRouter({
  table: 'payments',
  createSchema: schema,
  updateSchema: schema.partial(),
  allowCreate: false,
  filterColumns: ['employee_id', 'payment_month', 'payment_year'],
  orderBy: 'payments.payment_year DESC, payments.payment_month DESC, payments.id DESC',
  listQuery: `SELECT payments.id, payments.employee_id, payments.payment_month, payments.payment_year,
                     (CASE WHEN payments.entry_type = 'reversal' THEN -payments.amount ELSE payments.amount END) AS amount,
                     payments.amount AS original_amount, payments.payment_date, payments.payment_mode,
                     payments.transaction_reference, payments.payment_proof, payments.remarks,
                     payments.created_by, payments.created_at, payments.updated_at,
                     payments.entry_type, payments.reverses_payment_id, payments.reversal_reason,
                     payments.idempotency_key,
                     EXISTS (SELECT 1 FROM payments r WHERE r.reverses_payment_id = payments.id) AS is_reversed,
                     employees.first_name, employees.last_name, employees.employee_code
              FROM payments JOIN employees ON employees.id = payments.employee_id`,
  beforeUpdate: () => { throw new HttpError(405, 'Payments are immutable; record a reversal instead'); },
  beforeDelete: () => { throw new HttpError(405, 'Payments are immutable; record a reversal instead'); },
}));

export default router;
