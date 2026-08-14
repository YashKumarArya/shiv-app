import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/db.js';
import { monthString } from '../lib/fields.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { getSalarySettings, payableDays } from '../lib/payroll.js';
import { parseInput } from '../lib/validation.js';
import { actingEmployeeId, requireField } from '../middleware/auth.js';

/**
 * The guard and supervisor app's entire data surface.
 *
 * Every handler resolves the employee from the session via actingEmployeeId and
 * takes no employee id from the caller. That is the whole point of this module:
 * the office routes list across the agency, so field logins are refused there
 * and read their own record only through these endpoints.
 */
const router = Router();

router.use(requireField);

router.get('/profile', asyncHandler(async (req, res) => {
  const employeeId = actingEmployeeId(req);

  const employee = await queryOne(
    `SELECT e.id, e.employee_code, e.first_name, e.last_name, e.photo, e.phone,
            e.alternate_phone, e.email, e.address, e.blood_group, e.status,
            to_char(e.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
            to_char(e.joining_date, 'YYYY-MM-DD') AS joining_date,
            d.designation_name
     FROM employees e
     JOIN designations d ON d.id = e.designation_id
     WHERE e.id = $1`,
    [employeeId],
  );
  if (!employee) throw new HttpError(404, 'Employee record not found');

  const posting = await queryOne(
    `SELECT a.shift, to_char(a.start_date, 'YYYY-MM-DD') AS start_date,
            l.id AS location_id, l.site_name, l.address, l.city,
            l.contact_person, l.contact_number
     FROM employee_assignments a
     JOIN locations l ON l.id = a.location_id
     WHERE a.employee_id = $1
       AND a.status = 'Active'
       AND a.start_date <= CURRENT_DATE
       AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
     ORDER BY a.start_date DESC, a.id DESC
     LIMIT 1`,
    [employeeId],
  );

  // Aadhaar, salary and document numbers are deliberately not returned here.
  res.json({ employee, posting: posting ?? null });
}));

/**
 * Mirrors the shape of /attendance/employee/:id/calendar so the guard app can
 * reuse the office work-calendar screen unchanged.
 */
router.get('/attendance', asyncHandler(async (req, res) => {
  const employeeId = actingEmployeeId(req);
  const month = parseInput(monthString, req.query.month, 'month');

  const employee = await queryOne(
    `SELECT e.id, e.employee_code, e.first_name, e.last_name, e.photo, e.status,
            to_char(e.joining_date, 'YYYY-MM-DD') AS joining_date,
            e.designation_id, d.designation_name
     FROM employees e
     JOIN designations d ON d.id = e.designation_id
     WHERE e.id = $1`,
    [employeeId],
  );
  if (!employee) throw new HttpError(404, 'Employee record not found');

  const days = await query<{ status: string }>(
    `SELECT a.id, to_char(a.attendance_date, 'YYYY-MM-DD') AS attendance_date,
            a.status, a.check_in, a.check_out, a.remarks,
            a.location_id, l.site_name
     FROM attendance a
     LEFT JOIN locations l ON l.id = a.location_id
     WHERE a.employee_id = $1
       AND a.attendance_date >= $2::date
       AND a.attendance_date < ($2::date + INTERVAL '1 month')
     ORDER BY a.attendance_date`,
    [employeeId, `${month}-01`],
  );

  const summary = days.reduce(
    (totals, row) => {
      if (row.status === 'Present') totals.present += 1;
      if (row.status === 'Half Day') totals.half_day += 1;
      if (row.status === 'Absent') totals.absent += 1;
      if (row.status === 'Leave') totals.leave += 1;
      return totals;
    },
    { present: 0, half_day: 0, absent: 0, leave: 0 },
  );

  res.json({
    employee,
    month,
    days,
    summary: {
      ...summary,
      worked_days: summary.present + summary.half_day * 0.5,
      total_marked: days.length,
    },
  });
}));

const salaryQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

/**
 * One month of the guard's own pay: what they earned from attendance, what has
 * been paid, and the individual payments.
 *
 * Reuses the payroll settings and payable-day rules the office tracking screen
 * uses, so a guard never sees a figure that disagrees with the admin's. Where a
 * payroll snapshot has been finalized, that frozen basis wins over the live
 * employee/designation salary, exactly as /payments/tracking does.
 */
router.get('/salary', asyncHandler(async (req, res) => {
  const employeeId = actingEmployeeId(req);
  const { month, year } = parseInput(salaryQuerySchema, req.query);

  if (new Date(Date.UTC(year, month - 1, 1)) > new Date()) {
    throw new HttpError(400, 'A future payroll period is not available');
  }

  const settings = await getSalarySettings();
  const payable = payableDays(year, month, settings);

  // Mirrors the basis in /payments/tracking exactly, including the LEAST cap and
  // the preference for a finalized snapshot over live attendance. Recomputing it
  // differently here is how a guard ends up being told a number their supervisor
  // cannot see, so the two must stay in step.
  //
  // $4 is cast to numeric at every use. Referencing one parameter as both int and
  // numeric makes PostgreSQL deduce two types for it and refuse to plan (42P08).
  const basis = await queryOne<{
    effective_salary: number | null;
    worked_days: number;
    payable_days: number;
    due_amount: number | null;
    designation_name: string;
    payroll_finalized: boolean;
  }>(
    `SELECT COALESCE(ps.designation_name, d.designation_name) AS designation_name,
            (ps.id IS NOT NULL) AS payroll_finalized,
            (CASE WHEN ps.id IS NULL THEN COALESCE(e.salary, d.default_salary)
                  ELSE ps.effective_salary END)::float AS effective_salary,
            (CASE WHEN ps.id IS NULL THEN COALESCE(att.worked_days, 0)
                  ELSE ps.worked_days END)::float AS worked_days,
            (CASE WHEN ps.id IS NULL THEN ($4::numeric)::int
                  ELSE ps.payable_days END)::int AS payable_days,
            (CASE WHEN ps.id IS NULL THEN
               CASE WHEN COALESCE(e.salary, d.default_salary) IS NULL THEN NULL
                    ELSE LEAST(
                      COALESCE(e.salary, d.default_salary)::numeric,
                      ROUND(
                        COALESCE(e.salary, d.default_salary)::numeric
                          * COALESCE(att.worked_days, 0) / $4::numeric,
                        2
                      )
                    )
               END
               ELSE ps.due_amount END)::float AS due_amount
     FROM employees e
     JOIN designations d ON d.id = e.designation_id
     LEFT JOIN payroll_snapshots ps
       ON ps.employee_id = e.id AND ps.payment_month = $2 AND ps.payment_year = $3
     LEFT JOIN LATERAL (
       SELECT SUM(
         CASE WHEN a.status = 'Present' THEN 1::numeric
              WHEN a.status = 'Half Day' THEN 0.5::numeric
              ELSE 0::numeric END
       ) AS worked_days
       FROM attendance a
       WHERE a.employee_id = e.id
         AND a.attendance_date >= make_date($3, $2, 1)
         AND a.attendance_date < make_date($3, $2, 1) + INTERVAL '1 month'
     ) att ON TRUE
     WHERE e.id = $1`,
    [employeeId, month, year, payable],
  );
  if (!basis) throw new HttpError(404, 'Employee record not found');

  // Signed like /payments/tracking, so a reversal is a negative entry in both
  // places and the client never has to know the storage convention.
  const payments = await query<{ amount: number }>(
    `SELECT id, entry_type,
            (CASE WHEN entry_type = 'reversal' THEN -amount ELSE amount END)::float AS amount,
            to_char(payment_date, 'YYYY-MM-DD') AS payment_date,
            payment_mode, transaction_reference, remarks, created_at
     FROM payments
     WHERE employee_id = $1 AND payment_month = $2 AND payment_year = $3
     ORDER BY payment_date DESC NULLS LAST, id DESC`,
    [employeeId, month, year],
  );

  const paidAmount = payments.reduce((total, payment) => total + payment.amount, 0);
  const dueAmount = basis.due_amount;

  res.json({
    month,
    year,
    designation_name: basis.designation_name,
    salary_set: basis.effective_salary !== null,
    monthly_salary: basis.effective_salary,
    payable_days: basis.payable_days,
    worked_days: basis.worked_days,
    per_day_rate: basis.effective_salary === null
      ? null
      : Number((basis.effective_salary / basis.payable_days).toFixed(2)),
    due_amount: dueAmount,
    paid_amount: Number(paidAmount.toFixed(2)),
    remaining_amount: dueAmount === null ? null : Number(Math.max(dueAmount - paidAmount, 0).toFixed(2)),
    payroll_finalized: basis.payroll_finalized,
    payments,
  });
}));

export default router;
