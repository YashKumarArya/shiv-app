import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { crudRouter } from '../lib/crud.js';
import { dateString, id, timeString } from '../lib/fields.js';
import { asyncHandler, HttpError } from '../lib/http.js';

const schema = z.object({
  employee_id: id,
  location_id: id.optional(),
  attendance_date: dateString,
  check_in: timeString.optional(),
  check_out: timeString.optional(),
  status: z.enum(['Present', 'Absent', 'Half Day', 'Leave']),
  remarks: z.string().optional(),
});

const router = Router();

/** Daily roster: every active employee with their current assignment,
 *  the day's attendance (if marked), and days present in that month. */
router.get('/roster', asyncHandler(async (req, res) => {
  const date = (req.query.date as string) ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'date must be YYYY-MM-DD');

  const rows = await query(
    `SELECT e.id AS employee_id, e.first_name, e.last_name, e.employee_code,
            asg.shift, loc.site_name,
            att.id AS attendance_id, att.status,
            month.present_days
     FROM employees e
     LEFT JOIN LATERAL (
       SELECT a.shift, a.location_id
       FROM employee_assignments a
       WHERE a.employee_id = e.id AND a.status = 'Active'
       ORDER BY a.start_date DESC LIMIT 1
     ) asg ON TRUE
     LEFT JOIN locations loc ON loc.id = asg.location_id
     LEFT JOIN attendance att ON att.employee_id = e.id AND att.attendance_date = $1
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS present_days
       FROM attendance a2
       WHERE a2.employee_id = e.id AND a2.status = 'Present'
         AND date_trunc('month', a2.attendance_date) = date_trunc('month', $1::date)
     ) month ON TRUE
     WHERE e.status = 'Active'
     ORDER BY e.first_name, e.last_name`,
    [date],
  );
  res.json(rows);
}));

/** Mark every active employee without a record that day as Present. */
router.post('/mark-all-present', asyncHandler(async (req, res) => {
  const date = req.body?.date as string | undefined;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'date must be YYYY-MM-DD');

  const rows = await query(
    `INSERT INTO attendance (employee_id, attendance_date, status, marked_by)
     SELECT e.id, $1, 'Present', $2 FROM employees e
     WHERE e.status = 'Active'
       AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.employee_id = e.id AND a.attendance_date = $1)
     RETURNING id`,
    [date, req.user!.id],
  );
  res.status(201).json({ marked: rows.length });
}));

router.use(crudRouter({
  table: 'attendance',
  createSchema: schema,
  updateSchema: schema.partial(),
  filterColumns: ['employee_id', 'attendance_date', 'location_id', 'status'],
  listQuery: `SELECT attendance.*, employees.first_name, employees.last_name, locations.site_name
              FROM attendance
              JOIN employees ON employees.id = attendance.employee_id
              LEFT JOIN locations ON locations.id = attendance.location_id`,
  beforeCreate: (body, req) => ({ ...body, marked_by: req.user!.id }),
}));

export default router;
