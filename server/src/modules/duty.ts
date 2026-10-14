import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { withTransaction } from '../config/db.js';
import { id } from '../lib/fields.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { canonicalUploadPath } from '../lib/uploads.js';
import { parseInput } from '../lib/validation.js';
import { actingEmployeeId, requireField, requireOffice } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const DUTY_QR_PREFIX = 'shivapp:duty:';
const token = () => randomBytes(18).toString('base64url');
const payload = (kind: 'start' | 'end', value: string) => `${DUTY_QR_PREFIX}${kind}:${value}`;

const router = Router();

/** Office-only; creating a site's stickers is idempotent. */
router.get('/sites/:locationId/qr', requireOffice, asyncHandler(async (req, res) => {
  const locationId = parseInput(id, req.params.locationId, 'locationId');
  const codes = await withTransaction(async (tx) => {
    const location = await tx.queryOne<{ id: number; site_name: string; status: boolean }>(
      'SELECT id, site_name, status FROM locations WHERE id = $1', [locationId],
    );
    if (!location) throw new HttpError(404, 'Site not found');
    if (!location.status) throw new HttpError(409, 'Activate this site before printing duty QR codes');
    await tx.query(
      `INSERT INTO duty_qr_codes (location_id, start_token, end_token)
       VALUES ($1, $2, $3) ON CONFLICT (location_id) DO NOTHING`,
      [locationId, token(), token()],
    );
    const row = await tx.queryOne<{ start_token: string; end_token: string }>(
      'SELECT start_token, end_token FROM duty_qr_codes WHERE location_id = $1', [locationId],
    );
    return { ...location, ...row! };
  });
  res.json({
    location_id: codes.id,
    site_name: codes.site_name,
    start_payload: payload('start', codes.start_token),
    end_payload: payload('end', codes.end_token),
  });
}));

const scanSchema = z.object({
  client_uuid: z.string().uuid(),
  qr_payload: z.string().min(1).max(200),
  scanned_at: z.string().datetime({ offset: true }),
  photo: z.string().min(1),
});

router.post('/my/scans', requireField, validate(scanSchema), asyncHandler(async (req, res) => {
  const employeeId = actingEmployeeId(req);
  const body = req.body as z.infer<typeof scanSchema>;
  const match = /^shivapp:duty:(start|end):([A-Za-z0-9_-]{24})$/.exec(body.qr_payload);
  if (!match) throw new HttpError(422, 'This is not a Start Duty or End Duty site QR code');
  const kind = match[1] as 'start' | 'end';
  const photo = canonicalUploadPath(body.photo);
  if (!photo) throw new HttpError(400, 'Attach the live duty photo as an uploaded file');
  const skew = new Date(body.scanned_at).getTime() - Date.now();
  if (skew > 24 * 60 * 60_000 || skew < -14 * 24 * 60 * 60_000) {
    throw new HttpError(422, 'The scan time is too far from the current date. Check the phone clock.');
  }

  const result = await withTransaction(async (tx) => {
    // Serialise scans for one guard, including start/end requests retried offline.
    const employee = await tx.queryOne<{ id: number }>(
      'SELECT id FROM employees WHERE id = $1 FOR UPDATE', [employeeId],
    );
    if (!employee) throw new HttpError(404, 'Employee not found');
    const prior = await tx.queryOne<{ employee_id: number; location_id: number; attendance_date: string; kind: string }>(
      `SELECT employee_id, location_id, to_char(attendance_date, 'YYYY-MM-DD') AS attendance_date, kind
       FROM duty_scans WHERE client_uuid = $1`, [body.client_uuid],
    );
    if (prior) {
      if (prior.employee_id !== employeeId) throw new HttpError(403, 'This scan belongs to another guard');
      return { ...prior, duplicate: true };
    }

    const code = await tx.queryOne<{ location_id: number; site_name: string }>(
      `SELECT c.location_id, l.site_name FROM duty_qr_codes c
       JOIN locations l ON l.id = c.location_id
       WHERE ${kind === 'start' ? 'c.start_token' : 'c.end_token'} = $1 AND l.status`,
      [match[2]],
    );
    if (!code) throw new HttpError(404, 'This site duty QR code is not recognised');

    const moment = await tx.queryOne<{ day: string; time: string }>(
      `SELECT to_char($1::timestamptz, 'YYYY-MM-DD') AS day,
              to_char($1::timestamptz, 'HH24:MI') AS time`, [body.scanned_at],
    );
    const day = moment!.day;
    const time = moment!.time;
    let attendanceDate = day;
    let attendance: { id: number; status: string; check_in: string | null; check_out: string | null; location_id: number | null } | undefined;

    if (kind === 'end') {
      // A night shift can end after midnight; close its still-open start day.
      attendance = await tx.queryOne(
        `SELECT id, status, check_in, check_out, location_id,
                to_char(attendance_date, 'YYYY-MM-DD') AS attendance_date
         FROM attendance
         WHERE employee_id = $1 AND location_id = $2 AND status = 'Present'
           AND check_in IS NOT NULL AND check_out IS NULL
           AND attendance_date BETWEEN $3::date - 1 AND $3::date
         ORDER BY attendance_date DESC LIMIT 1 FOR UPDATE`,
        [employeeId, code.location_id, day],
      ) as typeof attendance & { attendance_date?: string };
      if (!attendance) throw new HttpError(409, 'Scan Start Duty at this site before End Duty');
      attendanceDate = (attendance as typeof attendance & { attendance_date: string }).attendance_date;
      const startScan = await tx.queryOne<{ scanned_at: Date }>(
        `SELECT scanned_at FROM duty_scans
         WHERE employee_id = $1 AND location_id = $2 AND attendance_date = $3::date AND kind = 'start'
         ORDER BY scanned_at DESC LIMIT 1`,
        [employeeId, code.location_id, attendanceDate],
      );
      if (!startScan) throw new HttpError(409, 'Scan Start Duty at this site before End Duty');
      if (new Date(body.scanned_at).getTime() <= new Date(startScan.scanned_at).getTime()) {
        throw new HttpError(409, 'End Duty must be scanned after Start Duty');
      }
    }

    const posting = await tx.queryOne<{ id: number }>(
      `SELECT id FROM employee_assignments WHERE employee_id = $1 AND location_id = $2
         AND start_date <= $3::date
       AND (end_date IS NULL OR end_date >= $3::date)
       LIMIT 1`, [employeeId, code.location_id, attendanceDate],
    );
    if (!posting) throw new HttpError(403, 'You are not posted to this site for this duty');

    const finalized = await tx.queryOne<{ id: number }>(
      `SELECT id FROM payroll_snapshots WHERE employee_id = $1
       AND payment_year = EXTRACT(YEAR FROM $2::date)::int
       AND payment_month = EXTRACT(MONTH FROM $2::date)::int`,
      [employeeId, attendanceDate],
    );
    if (finalized) throw new HttpError(409, 'Attendance is locked after payroll is finalized');

    if (kind === 'start') {
      attendance = await tx.queryOne(
        `SELECT id, status, check_in, check_out, location_id FROM attendance
         WHERE employee_id = $1 AND attendance_date = $2::date FOR UPDATE`,
        [employeeId, day],
      );
      if (attendance && attendance.status !== 'Present') {
        throw new HttpError(409, 'Office attendance for this date needs review before check-in');
      }
      if (attendance?.location_id && attendance.location_id !== code.location_id) {
        throw new HttpError(409, 'Office attendance already lists another site for this date');
      }
      if (attendance?.check_out) throw new HttpError(409, 'Office attendance already has an end time for this date');
      if (attendance?.check_in) throw new HttpError(409, 'Start Duty has already been scanned today');
      if (attendance) {
        await tx.query('UPDATE attendance SET check_in = $2::time, location_id = $3, updated_at = NOW() WHERE id = $1',
          [attendance.id, time, code.location_id]);
      } else {
        await tx.query(
          `INSERT INTO attendance (employee_id, location_id, attendance_date, check_in, status, marked_by)
           VALUES ($1, $2, $3::date, $4::time, 'Present', $5)`,
          [employeeId, code.location_id, day, time, req.user!.id],
        );
      }
    } else {
      await tx.query('UPDATE attendance SET check_out = $2::time, updated_at = NOW() WHERE id = $1',
        [attendance!.id, time]);
    }

    await tx.query(
      `INSERT INTO duty_scans (client_uuid, employee_id, location_id, attendance_date, kind, scanned_at, photo)
       VALUES ($1, $2, $3, $4::date, $5, $6::timestamptz, $7)`,
      [body.client_uuid, employeeId, code.location_id, attendanceDate, kind, body.scanned_at, photo],
    );
    return { employee_id: employeeId, location_id: code.location_id, site_name: code.site_name,
      attendance_date: attendanceDate, kind, duplicate: false };
  });

  res.status(result.duplicate ? 200 : 201).json(result);
}));

export default router;
