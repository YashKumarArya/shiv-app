import { Router } from 'express';
import { queryOne } from '../config/db.js';
import { asyncHandler } from '../lib/http.js';
import { getSalarySettings, payableDays } from '../lib/payroll.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const period = await queryOne<{ month: number; year: number }>(
    `SELECT EXTRACT(MONTH FROM CURRENT_DATE)::int AS month,
            EXTRACT(YEAR FROM CURRENT_DATE)::int AS year`,
  );
  const month = period!.month;
  const year = period!.year;
  const payable = payableDays(year, month, await getSalarySettings());

  const stats = await queryOne(`
    SELECT
      (SELECT COUNT(*)::int FROM employees) AS total_employees,
      (SELECT COUNT(*)::int FROM employees WHERE status = 'Active') AS active_employees,
      (SELECT COUNT(*)::int FROM attendance
        WHERE attendance_date = CURRENT_DATE AND status = 'Present') AS present_today,
      (SELECT COUNT(*)::int FROM locations WHERE status = TRUE) AS active_locations,
      (SELECT COUNT(*)::int
        FROM employees e
        JOIN designations d ON d.id = e.designation_id
        LEFT JOIN payroll_snapshots ps
          ON ps.employee_id = e.id AND ps.payment_month = $1 AND ps.payment_year = $2
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(
            CASE WHEN a.status = 'Present' THEN 1
                 WHEN a.status = 'Half Day' THEN 0.5
                 ELSE 0 END
          ), 0)::numeric AS worked_days
          FROM attendance a
          WHERE a.employee_id = e.id
            AND a.attendance_date >= make_date($2, $1, 1)
            AND a.attendance_date < make_date($2, $1, 1) + INTERVAL '1 month'
        ) att ON TRUE
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(
            CASE WHEN p.entry_type = 'reversal' THEN -p.amount ELSE p.amount END
          ), 0)::numeric AS amount
          FROM payments p
          WHERE p.employee_id = e.id
            AND p.payment_month = $1
            AND p.payment_year = $2
        ) paid ON TRUE
        WHERE e.status = 'Active'
          AND CASE WHEN ps.id IS NOT NULL THEN ps.due_amount
                   ELSE LEAST(
                     COALESCE(e.salary, d.default_salary, 0)::numeric,
                     ROUND(COALESCE(e.salary, d.default_salary, 0)::numeric * att.worked_days / $3::numeric, 2)
                   )
              END > paid.amount
      ) AS pending_payments,
      (SELECT COUNT(*)::int
        FROM employees e
        JOIN designations d ON d.id = e.designation_id
        WHERE e.status = 'Active'
          AND e.salary IS NULL
          AND d.default_salary IS NULL
      ) AS missing_salaries,
      (SELECT COUNT(*)::int FROM employees e
        JOIN designations d ON d.id = e.designation_id
        WHERE e.status = 'Active' AND d.uniform_required AND NOT EXISTS (
          SELECT 1 FROM uniform_issues u WHERE u.employee_id = e.id AND NOT u.returned
        )) AS uniform_pending
  `, [month, year, payable]);
  res.json(stats);
}));

export default router;
