import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/db.js';
import { crudRouter } from '../lib/crud.js';
import { dateString, id } from '../lib/fields.js';
import { asyncHandler, HttpError } from '../lib/http.js';

const schema = z.object({
  employee_id: id,
  issued_date: dateString,
  uniform_size: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  returned: z.boolean().optional(),
  returned_date: dateString.nullable().optional(),
});

const trackingQuerySchema = z.object({
  employee_id: id.optional(),
});

interface UniformTrackingRow {
  employee_id: number;
  employee_code: string;
  first_name: string;
  last_name: string | null;
  designation_name: string;
  employee_status: 'Active' | 'Inactive';
  issue_id: number | null;
  issued_date: string | null;
  uniform_size: string | null;
  remarks: string | null;
}

const router = Router();

router.get('/tracking', asyncHandler(async (req, res) => {
  const parsed = trackingQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new HttpError(400, message);
  }

  const employeeId = parsed.data.employee_id ?? null;
  const rows = await query<UniformTrackingRow>(
    `SELECT e.id AS employee_id, e.employee_code, e.first_name, e.last_name,
            d.designation_name, e.status AS employee_status,
            latest_issue.id AS issue_id,
            to_char(latest_issue.issued_date, 'YYYY-MM-DD') AS issued_date,
            latest_issue.uniform_size,
            latest_issue.remarks
     FROM employees e
     JOIN designations d ON d.id = e.designation_id
     LEFT JOIN LATERAL (
       SELECT u.id, u.issued_date, u.uniform_size, u.remarks
       FROM uniform_issues u
       WHERE u.employee_id = e.id AND u.returned = FALSE
       ORDER BY u.issued_date DESC, u.id DESC
       LIMIT 1
     ) latest_issue ON TRUE
     WHERE $1::int IS NULL OR e.id = $1
     ORDER BY e.first_name, e.last_name, e.employee_code`,
    [employeeId],
  );

  const employees = rows.map((row) => {
    const employee = {
      employee_id: row.employee_id,
      employee_code: row.employee_code,
      first_name: row.first_name,
      last_name: row.last_name,
      designation_name: row.designation_name,
      employee_status: row.employee_status,
      status: row.issue_id == null ? 'Not Issued' as const : 'Issued' as const,
    };

    if (row.issue_id == null) return employee;
    return {
      ...employee,
      issue_id: row.issue_id,
      issued_date: row.issued_date,
      uniform_size: row.uniform_size,
      remarks: row.remarks,
    };
  });
  const issued = employees.filter((employee) => employee.status === 'Issued').length;

  res.json({
    summary: {
      total: employees.length,
      issued,
      not_issued: employees.length - issued,
    },
    employees,
  });
}));

router.use(crudRouter({
  table: 'uniform_issues',
  createSchema: schema,
  updateSchema: schema.partial(),
  filterColumns: ['employee_id', 'returned'],
  listQuery: `SELECT uniform_issues.*, employees.first_name, employees.last_name
              FROM uniform_issues JOIN employees ON employees.id = uniform_issues.employee_id`,
  beforeCreate: async (body, req) => {
    const outstanding = await queryOne<{ id: number }>(
      `SELECT id FROM uniform_issues WHERE employee_id = $1 AND returned = FALSE LIMIT 1`,
      [body.employee_id],
    );
    if (outstanding) {
      throw new HttpError(409, 'This employee already has an issued uniform');
    }
    return { ...body, issued_by: req.user!.id };
  },
}));

export default router;
