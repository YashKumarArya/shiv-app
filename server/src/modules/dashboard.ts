import { Router } from 'express';
import { queryOne } from '../config/db.js';
import { asyncHandler } from '../lib/http.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
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
        LEFT JOIN (
          SELECT employee_id, SUM(amount) AS amount
          FROM payments
          WHERE payment_month = EXTRACT(MONTH FROM CURRENT_DATE)
            AND payment_year = EXTRACT(YEAR FROM CURRENT_DATE)
          GROUP BY employee_id
        ) p ON p.employee_id = e.id
        WHERE e.status = 'Active'
          AND COALESCE(e.salary, d.default_salary, 0) > COALESCE(p.amount, 0)
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
  `);
  res.json(stats);
}));

export default router;
