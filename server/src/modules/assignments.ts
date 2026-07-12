import { z } from 'zod';
import { query } from '../config/db.js';
import { crudRouter } from '../lib/crud.js';
import { dateString, id } from '../lib/fields.js';

const schema = z.object({
  employee_id: id,
  location_id: id,
  shift: z.string().optional(),
  start_date: dateString,
  end_date: dateString.optional(),
  status: z.enum(['Active', 'Ended']).optional(),
});

export default crudRouter({
  table: 'employee_assignments',
  createSchema: schema,
  updateSchema: schema.partial(),
  filterColumns: ['employee_id', 'location_id', 'status'],
  listQuery: `SELECT employee_assignments.*, employees.first_name, employees.last_name, locations.site_name
              FROM employee_assignments
              JOIN employees ON employees.id = employee_assignments.employee_id
              JOIN locations ON locations.id = employee_assignments.location_id`,
  // Reassignment: close the previous active posting so history is preserved.
  beforeCreate: async (body) => {
    await query(
      `UPDATE employee_assignments SET status = 'Ended', end_date = CURRENT_DATE, updated_at = NOW()
       WHERE employee_id = $1 AND status = 'Active'`,
      [body.employee_id],
    );
    return body;
  },
});
