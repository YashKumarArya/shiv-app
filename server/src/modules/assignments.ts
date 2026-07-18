import { z } from 'zod';
import type { DbExecutor } from '../config/db.js';
import { crudRouter } from '../lib/crud.js';
import { dateString, id } from '../lib/fields.js';
import { HttpError } from '../lib/http.js';
import { parseInput } from '../lib/validation.js';

const fields = z.object({
  employee_id: id,
  location_id: id,
  shift: z.string().nullable().optional(),
  start_date: dateString,
  end_date: dateString.nullable().optional(),
  status: z.enum(['Active', 'Ended']).optional(),
});

const schema = fields.superRefine((assignment, context) => {
  const status = assignment.status ?? 'Active';
  if (assignment.end_date && assignment.end_date < assignment.start_date) {
    context.addIssue({ code: 'custom', path: ['end_date'], message: 'must be on or after start_date' });
  }
  if (status === 'Active' && assignment.end_date) {
    context.addIssue({ code: 'custom', path: ['end_date'], message: 'must be empty for an active assignment' });
  }
  if (status === 'Ended' && !assignment.end_date) {
    context.addIssue({ code: 'custom', path: ['end_date'], message: 'is required for an ended assignment' });
  }
});

interface AssignmentRecord {
  id: number;
  employee_id: number;
  location_id: number;
  shift: string | null;
  start_date: string;
  end_date: string | null;
  status: 'Active' | 'Ended';
}

const lockEmployeeAndLocation = async (
  tx: DbExecutor,
  employeeId: number,
  locationId: number,
  requireActive: boolean,
) => {
  const employee = await tx.queryOne<{ status: 'Active' | 'Inactive' }>(
    `SELECT status FROM employees WHERE id = $1 FOR UPDATE`,
    [employeeId],
  );
  if (!employee) throw new HttpError(404, 'Employee not found');

  const location = await tx.queryOne<{ status: boolean }>(
    `SELECT status FROM locations WHERE id = $1 FOR SHARE`,
    [locationId],
  );
  if (!location) throw new HttpError(404, 'Location not found');
  if (requireActive && employee.status !== 'Active') {
    throw new HttpError(409, 'An inactive employee cannot have an active assignment');
  }
  if (requireActive && !location.status) {
    throw new HttpError(409, 'An inactive location cannot receive an active assignment');
  }
};

const ensureNoOverlap = async (
  tx: DbExecutor,
  assignment: Omit<AssignmentRecord, 'id'>,
  excludedId?: number,
) => {
  const overlap = await tx.queryOne<{ id: number }>(
    `SELECT id
     FROM employee_assignments
     WHERE employee_id = $1
       AND ($4::int IS NULL OR id <> $4)
       AND daterange(start_date, COALESCE(end_date, 'infinity'::date), '[]')
           && daterange($2::date, COALESCE($3::date, 'infinity'::date), '[]')
     LIMIT 1`,
    [assignment.employee_id, assignment.start_date, assignment.end_date, excludedId ?? null],
  );
  if (overlap) throw new HttpError(409, 'This assignment overlaps another posting for the employee');
};

export default crudRouter({
  table: 'employee_assignments',
  createSchema: schema,
  updateSchema: fields.partial(),
  filterColumns: ['employee_id', 'location_id', 'status'],
  listQuery: `SELECT employee_assignments.id, employee_assignments.employee_id,
                     employee_assignments.location_id, employee_assignments.shift,
                     employee_assignments.start_date, employee_assignments.end_date,
                     employee_assignments.status,
                     employee_assignments.created_at, employee_assignments.updated_at,
                     CASE
                       WHEN employee_assignments.start_date > CURRENT_DATE THEN 'Planned'
                       WHEN employee_assignments.end_date IS NULL OR employee_assignments.end_date >= CURRENT_DATE THEN 'Active'
                       ELSE 'Ended'
                     END AS display_status,
                     employees.first_name, employees.last_name, locations.site_name
              FROM employee_assignments
              JOIN employees ON employees.id = employee_assignments.employee_id
              JOIN locations ON locations.id = employee_assignments.location_id`,
  // Reassignment is one transaction: serialize by employee, close the previous
  // posting on the day before this one starts, then insert the replacement.
  beforeCreate: async (body, _req, tx) => {
    const assignment = parseInput(schema, { ...body, status: body.status ?? 'Active' });
    const status = assignment.status ?? 'Active';
    await lockEmployeeAndLocation(tx, assignment.employee_id, assignment.location_id, status === 'Active');

    if (status === 'Active') {
      const current = await tx.queryOne<{ id: number; start_date: string }>(
        `SELECT id, to_char(start_date, 'YYYY-MM-DD') AS start_date
         FROM employee_assignments
         WHERE employee_id = $1 AND status = 'Active'
         ORDER BY start_date DESC, id DESC
         LIMIT 1
         FOR UPDATE`,
        [assignment.employee_id],
      );
      if (current) {
        if (assignment.start_date <= current.start_date) {
          throw new HttpError(409, 'A replacement assignment must start after the current assignment');
        }
        await tx.query(
          `UPDATE employee_assignments
           SET status = 'Ended', end_date = $2::date - 1, updated_at = NOW()
           WHERE id = $1`,
          [current.id, assignment.start_date],
        );
      }
    }

    const normalized = { ...assignment, status } as Omit<AssignmentRecord, 'id'>;
    await ensureNoOverlap(tx, normalized);
    return normalized;
  },
  beforeUpdate: async (body, _req, assignmentId, tx) => {
    // Read the owner first, then lock employee -> assignment in the same order
    // used by creation. This avoids a create/update deadlock on one employee.
    const owner = await tx.queryOne<{ employee_id: number; location_id: number }>(
      `SELECT employee_id, location_id FROM employee_assignments WHERE id = $1`,
      [assignmentId],
    );
    if (!owner) throw new HttpError(404, 'Assignment not found');
    await lockEmployeeAndLocation(tx, owner.employee_id, owner.location_id, false);

    const existing = await tx.queryOne<AssignmentRecord>(
      `SELECT id, employee_id, location_id, shift,
              to_char(start_date, 'YYYY-MM-DD') AS start_date,
              CASE WHEN end_date IS NULL THEN NULL ELSE to_char(end_date, 'YYYY-MM-DD') END AS end_date,
              status
       FROM employee_assignments
       WHERE id = $1
       FOR UPDATE`,
      [assignmentId],
    );
    if (!existing) throw new HttpError(404, 'Assignment not found');
    if (body.employee_id !== undefined && Number(body.employee_id) !== existing.employee_id) {
      throw new HttpError(400, 'employee_id cannot be changed after an assignment is created');
    }

    const merged = parseInput(schema, { ...existing, ...body });
    const status = merged.status ?? 'Active';
    await lockEmployeeAndLocation(tx, merged.employee_id, merged.location_id, status === 'Active');
    await ensureNoOverlap(tx, { ...merged, status } as Omit<AssignmentRecord, 'id'>, assignmentId);
    return body;
  },
});
