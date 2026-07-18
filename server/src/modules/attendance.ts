import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction, type DbExecutor } from '../config/db.js';
import { crudRouter } from '../lib/crud.js';
import { dateString, id, monthString, timeString } from '../lib/fields.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { parseInput } from '../lib/validation.js';

const schema = z.object({
  employee_id: id,
  location_id: id.nullable().optional(),
  attendance_date: dateString,
  check_in: timeString.nullable().optional(),
  check_out: timeString.nullable().optional(),
  status: z.enum(['Present', 'Absent', 'Half Day', 'Leave']),
  remarks: z.string().nullable().optional(),
});

const router = Router();

const assertAttendancePayrollOpen = async (
  tx: DbExecutor,
  employeeId: number,
  attendanceDate: string,
) => {
  const [year, month] = attendanceDate.split('-').map(Number);
  await tx.query(`SELECT id FROM employees WHERE id = $1 FOR SHARE`, [employeeId]);
  const snapshot = await tx.queryOne<{ id: number }>(
    `SELECT id FROM payroll_snapshots
     WHERE employee_id = $1 AND payment_year = $2 AND payment_month = $3`,
    [employeeId, year, month],
  );
  if (snapshot) {
    throw new HttpError(409, 'Attendance cannot be changed after payroll is finalized for this employee and month');
  }
};

type AttendanceCalendarStatus = 'Present' | 'Absent' | 'Half Day' | 'Leave';

interface AttendanceCalendarRow {
  id: number;
  attendance_date: string;
  status: AttendanceCalendarStatus;
  check_in: string | null;
  check_out: string | null;
  remarks: string | null;
  location_id: number | null;
  site_name: string | null;
}

/** Daily roster: every active employee with their current assignment,
 *  the day's attendance (if marked), and days present in that month. */
router.get('/roster', asyncHandler(async (req, res) => {
  const businessToday = req.query.date === undefined
    ? (await queryOne<{ date: string }>(`SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS date`))!.date
    : req.query.date;
  const date = parseInput(dateString, businessToday, 'date');

  const rows = await query(
    `SELECT e.id AS employee_id, e.first_name, e.last_name, e.employee_code, e.photo,
            asg.shift, loc.site_name,
            att.id AS attendance_id, att.status,
            month.worked_days,
            month.worked_days AS present_days
     FROM employees e
     LEFT JOIN LATERAL (
       SELECT a.shift, a.location_id
       FROM employee_assignments a
       WHERE a.employee_id = e.id
         AND a.start_date <= $1::date
         AND (a.end_date IS NULL OR a.end_date >= $1::date)
       ORDER BY a.start_date DESC LIMIT 1
     ) asg ON TRUE
     LEFT JOIN locations loc ON loc.id = asg.location_id
     LEFT JOIN attendance att ON att.employee_id = e.id AND att.attendance_date = $1
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(
         CASE WHEN a2.status = 'Present' THEN 1
              WHEN a2.status = 'Half Day' THEN 0.5
              ELSE 0 END
       ), 0)::float AS worked_days
       FROM attendance a2
       WHERE a2.employee_id = e.id
         AND date_trunc('month', a2.attendance_date) = date_trunc('month', $1::date)
     ) month ON TRUE
     WHERE e.joining_date <= $1::date
       AND (e.status = 'Active' OR att.id IS NOT NULL)
     ORDER BY e.first_name, e.last_name`,
    [date],
  );
  res.json(rows);
}));

/** Mark every active employee without a record that day as Present. */
router.post('/mark-all-present', asyncHandler(async (req, res) => {
  const date = parseInput(dateString, req.body?.date, 'date');

  const rows = await withTransaction(async (tx) => {
    const [year, month] = date.split('-').map(Number);
    await tx.query(
      `SELECT e.id
       FROM employees e
       WHERE e.status = 'Active'
         AND e.joining_date <= $1::date
         AND NOT EXISTS (
           SELECT 1 FROM attendance a
           WHERE a.employee_id = e.id AND a.attendance_date = $1::date
         )
       ORDER BY e.id
       FOR SHARE`,
      [date],
    );
    const finalized = await tx.queryOne<{ employee_code: string }>(
      `SELECT e.employee_code
       FROM employees e
       JOIN payroll_snapshots ps
         ON ps.employee_id = e.id AND ps.payment_year = $2 AND ps.payment_month = $3
       WHERE e.status = 'Active'
         AND e.joining_date <= $1::date
         AND NOT EXISTS (
           SELECT 1 FROM attendance a
           WHERE a.employee_id = e.id AND a.attendance_date = $1::date
         )
       ORDER BY e.id
       LIMIT 1`,
      [date, year, month],
    );
    if (finalized) {
      throw new HttpError(409, `Mark all cannot change finalized payroll attendance (${finalized.employee_code})`);
    }
    return tx.query(
      `INSERT INTO attendance (employee_id, attendance_date, status, marked_by)
       SELECT e.id, $1, 'Present', $2 FROM employees e
       WHERE e.status = 'Active'
         AND e.joining_date <= $1::date
         AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.employee_id = e.id AND a.attendance_date = $1)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [date, req.user!.id],
    );
  });
  res.status(201).json({ marked: rows.length });
}));

/** One employee's marked attendance for a calendar month. */
router.get('/employee/:employeeId/calendar', asyncHandler(async (req, res) => {
  const employeeId = parseInput(id, req.params.employeeId, 'employeeId');
  const month = parseInput(monthString, req.query.month, 'month');

  const employee = await queryOne<{
    id: number;
    employee_code: string;
    first_name: string;
    last_name: string | null;
    photo: string | null;
    designation_id: number;
    designation_name: string;
    status: 'Active' | 'Inactive';
    joining_date: string;
  }>(
    `SELECT e.id, e.employee_code, e.first_name, e.last_name, e.photo, e.status,
            to_char(e.joining_date, 'YYYY-MM-DD') AS joining_date,
            e.designation_id, d.designation_name
     FROM employees e
     JOIN designations d ON d.id = e.designation_id
     WHERE e.id = $1`,
    [employeeId],
  );
  if (!employee) throw new HttpError(404, 'Employee not found');

  const attendance = await query<AttendanceCalendarRow>(
    `SELECT a.id, to_char(a.attendance_date, 'YYYY-MM-DD') AS attendance_date,
            a.status, a.check_in, a.check_out, a.remarks,
            a.location_id, l.site_name
     FROM attendance a
     LEFT JOIN locations l ON l.id = a.location_id
     WHERE a.employee_id = $1
       AND a.attendance_date >= $2::date
       AND a.attendance_date < ($2::date + INTERVAL '1 month')
     ORDER BY a.attendance_date`,
    [employee.id, `${month}-01`],
  );

  const summary = attendance.reduce(
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
    days: attendance,
    summary: {
      ...summary,
      worked_days: summary.present + summary.half_day * 0.5,
      total_marked: attendance.length,
    },
  });
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
  beforeCreate: async (body, req, tx) => {
    const employee = await tx.queryOne<{ joining_date: string }>(
      `SELECT to_char(joining_date, 'YYYY-MM-DD') AS joining_date
       FROM employees WHERE id = $1 FOR SHARE`,
      [body.employee_id],
    );
    if (!employee) throw new HttpError(404, 'Employee not found');
    if (String(body.attendance_date) < employee.joining_date) {
      throw new HttpError(409, 'Attendance cannot be marked before the employee joining date');
    }
    await assertAttendancePayrollOpen(tx, Number(body.employee_id), String(body.attendance_date));
    return { ...body, marked_by: req.user!.id };
  },
  beforeUpdate: async (body, req, attendanceId, tx) => {
    const existing = await tx.queryOne<{ employee_id: number; attendance_date: string }>(
      `SELECT employee_id, to_char(attendance_date, 'YYYY-MM-DD') AS attendance_date
       FROM attendance WHERE id = $1 FOR UPDATE`,
      [attendanceId],
    );
    if (!existing) throw new HttpError(404, 'Attendance record not found');
    if (body.employee_id !== undefined && Number(body.employee_id) !== existing.employee_id) {
      throw new HttpError(400, 'employee_id cannot be changed after attendance is marked');
    }
    if (body.attendance_date !== undefined && body.attendance_date !== existing.attendance_date) {
      throw new HttpError(400, 'attendance_date cannot be changed after attendance is marked');
    }
    await assertAttendancePayrollOpen(tx, existing.employee_id, existing.attendance_date);
    return body;
  },
  beforeDelete: async (req, attendanceId, tx) => {
    const existing = await tx.queryOne<{ employee_id: number; attendance_date: string }>(
      `SELECT employee_id, to_char(attendance_date, 'YYYY-MM-DD') AS attendance_date
       FROM attendance WHERE id = $1 FOR UPDATE`,
      [attendanceId],
    );
    if (!existing) throw new HttpError(404, 'Attendance record not found');
    await assertAttendancePayrollOpen(tx, existing.employee_id, existing.attendance_date);
  },
}));

export default router;
