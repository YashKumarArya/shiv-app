import { z } from 'zod';
import { crudRouter } from '../lib/crud.js';
import { dateString, id, timeString } from '../lib/fields.js';

const schema = z.object({
  employee_id: id,
  location_id: id.optional(),
  attendance_date: dateString,
  check_in: timeString.optional(),
  check_out: timeString.optional(),
  status: z.enum(['Present', 'Absent', 'Half Day', 'Leave']),
  remarks: z.string().optional(),
});

export default crudRouter({
  table: 'attendance',
  createSchema: schema,
  updateSchema: schema.partial(),
  filterColumns: ['employee_id', 'attendance_date', 'location_id', 'status'],
  listQuery: `SELECT attendance.*, employees.first_name, employees.last_name, locations.site_name
              FROM attendance
              JOIN employees ON employees.id = attendance.employee_id
              LEFT JOIN locations ON locations.id = attendance.location_id`,
  beforeCreate: (body, req) => ({ ...body, marked_by: req.user!.id }),
});
