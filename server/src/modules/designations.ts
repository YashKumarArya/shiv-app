import { z } from 'zod';
import { crudRouter } from '../lib/crud.js';
import { money } from '../lib/fields.js';
import { HttpError } from '../lib/http.js';
import { assertCompletedPayrollFinalized } from '../lib/payroll.js';

const schema = z.object({
  designation_name: z.string().min(1),
  description: z.string().nullable().optional(),
  default_salary: money.nullable().optional(),
  uniform_required: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export default crudRouter({
  table: 'designations',
  createSchema: schema,
  updateSchema: schema.partial(),
  searchColumns: ['designation_name'],
  filterColumns: ['is_active'],
  beforeUpdate: async (body, _req, designationId, tx) => {
    const designation = await tx.queryOne<{ default_salary: number | null }>(
      `SELECT default_salary::float AS default_salary
       FROM designations WHERE id = $1 FOR UPDATE`,
      [designationId],
    );
    if (!designation) throw new HttpError(404, 'Designation not found');

    if (body.default_salary !== undefined || body.designation_name !== undefined) {
      await assertCompletedPayrollFinalized(tx, { designationId });
    }

    if (body.default_salary !== undefined) {
      const nextSalary = body.default_salary as number | null;
      const cents = (value: number | null) => Math.round((value ?? 0) * 100);
      if (cents(nextSalary) < cents(designation.default_salary)) {
        // Payment creation locks the same employee row, closing the race between
        // this validation and the designation update.
        await tx.query(
          `SELECT id FROM employees
           WHERE designation_id = $1 AND salary IS NULL
           ORDER BY id FOR UPDATE`,
          [designationId],
        );
        const violation = await tx.queryOne<{ employee_code: string; paid: number }>(
          `SELECT e.employee_code,
                  COALESCE(SUM(CASE WHEN p.entry_type = 'reversal' THEN -p.amount ELSE p.amount END), 0)::float AS paid
           FROM employees e
           LEFT JOIN payroll_snapshots ps
             ON ps.employee_id = e.id
            AND ps.payment_year = EXTRACT(YEAR FROM CURRENT_DATE)::int
            AND ps.payment_month = EXTRACT(MONTH FROM CURRENT_DATE)::int
           LEFT JOIN payments p
             ON p.employee_id = e.id
            AND p.payment_year = EXTRACT(YEAR FROM CURRENT_DATE)::int
            AND p.payment_month = EXTRACT(MONTH FROM CURRENT_DATE)::int
           WHERE e.designation_id = $1 AND e.salary IS NULL AND ps.id IS NULL
           GROUP BY e.id, e.employee_code
           HAVING COALESCE(SUM(CASE WHEN p.entry_type = 'reversal' THEN -p.amount ELSE p.amount END), 0) > $2::numeric
           ORDER BY e.id
           LIMIT 1`,
          [designationId, nextSalary ?? 0],
        );
        if (violation) {
          throw new HttpError(
            409,
            `Default salary cannot be reduced below the ${violation.paid.toFixed(2)} already paid to ${violation.employee_code} for the open current payroll`,
          );
        }
      }
    }
    return body;
  },
});
