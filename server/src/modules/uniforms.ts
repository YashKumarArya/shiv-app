import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { crudRouter } from '../lib/crud.js';
import { dateString, id } from '../lib/fields.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { parseInput } from '../lib/validation.js';

const issueFields = z.object({
  employee_id: id,
  issued_date: dateString,
  uniform_size: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
});

const updateSchema = issueFields.partial().extend({
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
  photo: string | null;
  designation_name: string;
  employee_status: 'Active' | 'Inactive';
  issue_id: number | null;
  issued_date: string | null;
  uniform_size: string | null;
  remarks: string | null;
}

const router = Router();

router.get('/tracking', asyncHandler(async (req, res) => {
  const employeeId = parseInput(trackingQuerySchema, req.query).employee_id ?? null;
  const rows = await query<UniformTrackingRow>(
    `SELECT e.id AS employee_id, e.employee_code, e.first_name, e.last_name, e.photo,
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
     WHERE (e.status = 'Active' OR latest_issue.id IS NOT NULL OR ($1::int IS NOT NULL AND e.id = $1))
       AND ($1::int IS NULL OR e.id = $1)
     ORDER BY e.first_name, e.last_name, e.employee_code`,
    [employeeId],
  );

  const employees = rows.map((row) => {
    const employee = {
      employee_id: row.employee_id,
      employee_code: row.employee_code,
      first_name: row.first_name,
      last_name: row.last_name,
      photo: row.photo,
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
  createSchema: issueFields,
  updateSchema,
  filterColumns: ['employee_id', 'returned'],
  listQuery: `SELECT uniform_issues.*, employees.first_name, employees.last_name
              FROM uniform_issues JOIN employees ON employees.id = uniform_issues.employee_id`,
  beforeCreate: async (body, req, tx) => {
    const employee = await tx.queryOne<{ status: 'Active' | 'Inactive' }>(
      `SELECT status FROM employees WHERE id = $1 FOR UPDATE`,
      [body.employee_id],
    );
    if (!employee) throw new HttpError(404, 'Employee not found');
    if (employee.status !== 'Active') {
      throw new HttpError(409, 'A uniform cannot be issued to an inactive employee');
    }

    const outstanding = await tx.queryOne<{ id: number }>(
      `SELECT id FROM uniform_issues WHERE employee_id = $1 AND returned = FALSE LIMIT 1`,
      [body.employee_id],
    );
    if (outstanding) {
      throw new HttpError(409, 'This employee already has an issued uniform');
    }
    return { ...body, issued_by: req.user!.id, returned: false, returned_date: null };
  },
  beforeUpdate: async (body, _req, issueId, tx) => {
    const existing = await tx.queryOne<{
      employee_id: number;
      issued_date: string;
      returned: boolean;
      returned_date: string | null;
    }>(
      `SELECT employee_id,
              to_char(issued_date, 'YYYY-MM-DD') AS issued_date,
              returned,
              CASE WHEN returned_date IS NULL THEN NULL ELSE to_char(returned_date, 'YYYY-MM-DD') END AS returned_date
       FROM uniform_issues
       WHERE id = $1
       FOR UPDATE`,
      [issueId],
    );
    if (!existing) throw new HttpError(404, 'Uniform issue not found');
    if (body.employee_id !== undefined && Number(body.employee_id) !== existing.employee_id) {
      throw new HttpError(400, 'employee_id cannot be changed after a uniform is issued');
    }

    await tx.query(`SELECT id FROM employees WHERE id = $1 FOR UPDATE`, [existing.employee_id]);
    if (existing.returned && body.returned === false) {
      throw new HttpError(409, 'A returned uniform cannot be reopened; create a new issue instead');
    }

    const returned = body.returned === undefined ? existing.returned : body.returned;
    const returnedDate = body.returned_date === undefined
      ? existing.returned_date
      : body.returned_date as string | null;
    const issuedDate = body.issued_date === undefined ? existing.issued_date : String(body.issued_date);
    if (returned && !returnedDate) {
      throw new HttpError(400, 'returned_date is required when a uniform is returned');
    }
    if (!returned && returnedDate) {
      throw new HttpError(400, 'returned_date must be empty until the uniform is returned');
    }
    if (returnedDate && returnedDate < issuedDate) {
      throw new HttpError(400, 'returned_date cannot be before issued_date');
    }
    return body;
  },
}));

export default router;
