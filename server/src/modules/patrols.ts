import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction, type DbExecutor } from '../config/db.js';
import { crudRouter } from '../lib/crud.js';
import { dateString, id, timeString } from '../lib/fields.js';
import { haversineMetres } from '../lib/geo.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { canonicalUploadPath } from '../lib/uploads.js';
import { parseInput } from '../lib/validation.js';
import { actingEmployeeId, requireField, requireOffice } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

/**
 * Printed into every checkpoint sticker. The prefix lets the scanner reject a
 * random product barcode instantly, which matters because scanning happens
 * offline and cannot ask the server what it just read.
 */
export const CHECKPOINT_QR_PREFIX = 'shivapp:cp:';

const qrToken = () => randomBytes(18).toString('base64url');

/**
 * What the guard app receives instead of the token itself.
 *
 * The app must recognise a scanned checkpoint while offline — to tell the guard
 * "you are 300 m away" at the gate rather than silently failing hours later on
 * sync — but handing it the tokens would let anyone holding a phone complete a
 * round from home. A hash identifies a code that was scanned without being
 * enough to produce one that was not.
 */
const qrTokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex').slice(0, 32);

const router = Router();

// ============================================================
// Office: route, checkpoint and schedule administration
// ============================================================

const routeFields = z.object({
  location_id: id,
  route_name: z.string().min(1).max(150),
  description: z.string().nullable().optional(),
  geofence_metres: z.coerce.number().int().min(10).max(2000).optional(),
  grace_minutes: z.coerce.number().int().min(5).max(720).optional(),
  is_active: z.boolean().optional(),
});

const routes = crudRouter({
  table: 'patrol_routes',
  createSchema: routeFields,
  updateSchema: routeFields.partial(),
  searchColumns: ['patrol_routes.route_name', 'locations.site_name'],
  filterColumns: ['location_id', 'is_active'],
  orderBy: 'locations.site_name, patrol_routes.route_name',
  listQuery: `SELECT patrol_routes.*, locations.site_name,
                     (SELECT COUNT(*) FROM patrol_checkpoints c
                       WHERE c.route_id = patrol_routes.id AND c.is_active)::int AS checkpoint_count,
                     (SELECT COUNT(*) FROM patrol_schedules s
                       WHERE s.route_id = patrol_routes.id AND s.is_active)::int AS schedule_count
              FROM patrol_routes
              JOIN locations ON locations.id = patrol_routes.location_id`,
});

const checkpointFields = z.object({
  route_id: id,
  checkpoint_name: z.string().min(1).max(150),
  // Optional on create: the next free position is assigned so an admin adding
  // stops in walking order never has to think about numbering.
  sequence: z.coerce.number().int().positive().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  is_active: z.boolean().optional(),
});

const requirePairedCoordinates = (body: Record<string, unknown>) => {
  const hasLatitude = body.latitude !== undefined && body.latitude !== null;
  const hasLongitude = body.longitude !== undefined && body.longitude !== null;
  if (hasLatitude !== hasLongitude) {
    throw new HttpError(400, 'Record both latitude and longitude, or neither');
  }
};

const checkpoints = crudRouter({
  table: 'patrol_checkpoints',
  createSchema: checkpointFields,
  updateSchema: checkpointFields.partial(),
  searchColumns: ['patrol_checkpoints.checkpoint_name'],
  filterColumns: ['route_id', 'is_active'],
  orderBy: 'patrol_checkpoints.sequence',
  listQuery: `SELECT patrol_checkpoints.*, patrol_routes.route_name, patrol_routes.location_id
              FROM patrol_checkpoints
              JOIN patrol_routes ON patrol_routes.id = patrol_checkpoints.route_id`,
  beforeCreate: async (body, _req, tx) => {
    requirePairedCoordinates(body);
    // Lock the route so two admins adding a stop at once cannot be handed the
    // same sequence number and collide on the unique constraint.
    const route = await tx.queryOne<{ id: number }>(
      `SELECT id FROM patrol_routes WHERE id = $1 FOR UPDATE`,
      [body.route_id],
    );
    if (!route) throw new HttpError(404, 'Patrol route not found');

    const next = await tx.queryOne<{ sequence: number }>(
      `SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
       FROM patrol_checkpoints WHERE route_id = $1`,
      [body.route_id],
    );
    return { ...body, sequence: body.sequence ?? next?.sequence ?? 1, qr_token: qrToken() };
  },
  beforeUpdate: async (body, _req, checkpointId, tx) => {
    requirePairedCoordinates(body);
    if (body.route_id !== undefined) {
      const existing = await tx.queryOne<{ route_id: number }>(
        `SELECT route_id FROM patrol_checkpoints WHERE id = $1`,
        [checkpointId],
      );
      if (!existing) throw new HttpError(404, 'Checkpoint not found');
      if (Number(body.route_id) !== existing.route_id) {
        // Moving a checkpoint would silently rewrite which round its past scans
        // belonged to. Retire it and add a new one on the other route instead.
        throw new HttpError(400, 'A checkpoint cannot be moved to a different route');
      }
    }
    // The sticker in the field cannot be rewritten from here.
    delete body.qr_token;
    return body;
  },
  beforeDelete: async (_req, checkpointId, tx) => {
    const scan = await tx.queryOne<{ id: number }>(
      `SELECT id FROM patrol_scans WHERE checkpoint_id = $1 LIMIT 1`,
      [checkpointId],
    );
    if (scan) {
      throw new HttpError(409, 'This checkpoint has patrol history. Mark it inactive instead of deleting it.');
    }
  },
});

const scheduleFields = z.object({
  route_id: id,
  start_time: timeString,
  days_of_week: z.array(z.coerce.number().int().min(1).max(7)).min(1).max(7).optional(),
  is_active: z.boolean().optional(),
});

const schedules = crudRouter({
  table: 'patrol_schedules',
  createSchema: scheduleFields,
  updateSchema: scheduleFields.partial(),
  filterColumns: ['route_id', 'is_active'],
  orderBy: 'patrol_schedules.start_time',
  listQuery: `SELECT patrol_schedules.*, patrol_routes.route_name, patrol_routes.location_id
              FROM patrol_schedules
              JOIN patrol_routes ON patrol_routes.id = patrol_schedules.route_id`,
  beforeCreate: async (body) => ({
    ...body,
    days_of_week: (body.days_of_week as number[] | undefined) ?? [1, 2, 3, 4, 5, 6, 7],
  }),
});

router.use('/routes', requireOffice, routes);
router.use('/checkpoints', requireOffice, checkpoints);
router.use('/schedules', requireOffice, schedules);

/**
 * Compliance for one day: what should have been walked against what was.
 *
 * Expected rounds are derived here rather than stored, so editing a schedule
 * never has to backfill or delete phantom rows. A round counts as done when any
 * guard assigned to the site completed it — the agency posts one guard per
 * shift, so expecting every assigned guard to walk every round would report
 * permanent false misses.
 */
router.get('/compliance', requireOffice, asyncHandler(async (req, res) => {
  const filters = parseInput(
    z.object({ date: dateString.optional(), location_id: id.optional() }),
    { date: req.query.date, location_id: req.query.location_id },
  );
  const onDate = filters.date ?? null;

  const rows = await query(
    `WITH target AS (SELECT COALESCE($1::date, CURRENT_DATE) AS patrol_date)
     SELECT r.id                AS route_id,
            r.route_name,
            r.grace_minutes,
            l.id                AS location_id,
            l.site_name,
            s.id                AS schedule_id,
            to_char(s.start_time, 'HH24:MI') AS start_time,
            t.patrol_date,
            (SELECT COUNT(*) FROM patrol_checkpoints c
              WHERE c.route_id = r.id AND c.is_active)::int AS checkpoint_count,
            sess.id             AS session_id,
            sess.employee_id,
            sess.started_at,
            sess.completed_at,
            e.first_name,
            e.last_name,
            (SELECT COUNT(*) FROM patrol_scans sc
              WHERE sc.session_id = sess.id)::int AS scan_count,
            ((t.patrol_date + s.start_time) + make_interval(mins => r.grace_minutes)) < NOW() AS window_closed,
            (t.patrol_date + s.start_time) <= NOW() AS window_open
     FROM target t
     JOIN patrol_routes r ON r.is_active
     JOIN locations l ON l.id = r.location_id
     JOIN patrol_schedules s
       ON s.route_id = r.id
      AND s.is_active
      AND EXTRACT(ISODOW FROM t.patrol_date)::smallint = ANY (s.days_of_week)
     LEFT JOIN LATERAL (
       SELECT ps.*
       FROM patrol_sessions ps
       WHERE ps.schedule_id = s.id AND ps.patrol_date = t.patrol_date
       ORDER BY ps.completed_at NULLS LAST, ps.started_at
       LIMIT 1
     ) sess ON TRUE
     LEFT JOIN employees e ON e.id = sess.employee_id
     WHERE ($2::int IS NULL OR l.id = $2)
     ORDER BY l.site_name, r.route_name, s.start_time`,
    [onDate, filters.location_id ?? null],
  );

  res.json(rows.map((row) => {
    const scanned = row.scan_count ?? 0;
    const expected = row.checkpoint_count ?? 0;
    const status = row.session_id
      ? (row.completed_at && expected > 0 && scanned >= expected ? 'Completed' : 'Partial')
      : row.window_closed
        ? 'Missed'
        : row.window_open
          ? 'Due'
          : 'Upcoming';
    return { ...row, status };
  }));
}));

/** Full detail of one walked round, including every scan photo, for review. */
router.get('/sessions/:id', requireOffice, asyncHandler(async (req, res) => {
  const sessionId = parseInput(id, req.params.id, 'id');
  const session = await queryOne(
    `SELECT ps.*, r.route_name, r.geofence_metres, l.site_name,
            e.first_name, e.last_name, e.employee_code,
            to_char(sch.start_time, 'HH24:MI') AS start_time
     FROM patrol_sessions ps
     JOIN patrol_routes r ON r.id = ps.route_id
     JOIN locations l ON l.id = r.location_id
     JOIN employees e ON e.id = ps.employee_id
     LEFT JOIN patrol_schedules sch ON sch.id = ps.schedule_id
     WHERE ps.id = $1`,
    [sessionId],
  );
  if (!session) throw new HttpError(404, 'Patrol session not found');

  const scans = await query(
    `SELECT sc.id, sc.checkpoint_id, sc.scanned_at, sc.server_received_at, sc.photo,
            sc.latitude, sc.longitude, sc.distance_metres,
            c.checkpoint_name, c.sequence
     FROM patrol_scans sc
     JOIN patrol_checkpoints c ON c.id = sc.checkpoint_id
     WHERE sc.session_id = $1
     ORDER BY sc.scanned_at`,
    [sessionId],
  );

  const expected = await query(
    `SELECT id, checkpoint_name, sequence
     FROM patrol_checkpoints
     WHERE route_id = $1 AND is_active
     ORDER BY sequence`,
    [session.route_id],
  );

  res.json({ session, scans, checkpoints: expected });
}));

// ============================================================
// Field: walking a patrol
// ============================================================

interface ActiveAssignment {
  location_id: number;
  site_name: string;
}

const activeAssignment = async (
  executor: DbExecutor,
  employeeId: number,
): Promise<ActiveAssignment | undefined> =>
  executor.queryOne<ActiveAssignment>(
    `SELECT a.location_id, l.site_name
     FROM employee_assignments a
     JOIN locations l ON l.id = a.location_id
     WHERE a.employee_id = $1
       AND a.status = 'Active'
       AND a.start_date <= CURRENT_DATE
       AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
     ORDER BY a.start_date DESC, a.id DESC
     LIMIT 1`,
    [employeeId],
  );

/**
 * Everything the guard's patrol screen needs for today, in one request so the
 * whole round is usable after a single online moment.
 *
 * Checkpoints carry qr_token_hash, never qr_token — see qrTokenHash above.
 */
router.get('/my/today', requireField, asyncHandler(async (req, res) => {
  const employeeId = actingEmployeeId(req);
  const assignment = await activeAssignment({ query, queryOne }, employeeId);
  if (!assignment) {
    res.json({ location: null, routes: [] });
    return;
  }

  const routeRows = await query(
    `SELECT id, route_name, description, geofence_metres, grace_minutes
     FROM patrol_routes
     WHERE location_id = $1 AND is_active
     ORDER BY route_name`,
    [assignment.location_id],
  );
  if (!routeRows.length) {
    res.json({ location: assignment, routes: [] });
    return;
  }

  const routeIds = routeRows.map((route) => route.id);
  const [checkpointRows, scheduleRows, sessionRows] = await Promise.all([
    query(
      `SELECT id, route_id, checkpoint_name, sequence, latitude, longitude, qr_token
       FROM patrol_checkpoints
       WHERE route_id = ANY ($1::int[]) AND is_active
       ORDER BY sequence`,
      [routeIds],
    ),
    query(
      `SELECT id, route_id, to_char(start_time, 'HH24:MI') AS start_time, days_of_week
       FROM patrol_schedules
       WHERE route_id = ANY ($1::int[]) AND is_active
       ORDER BY start_time`,
      [routeIds],
    ),
    query(
      `SELECT ps.id, ps.client_uuid, ps.route_id, ps.schedule_id, ps.started_at, ps.completed_at,
              COALESCE(
                json_agg(
                  json_build_object('checkpoint_id', sc.checkpoint_id, 'scanned_at', sc.scanned_at)
                  ORDER BY sc.scanned_at
                ) FILTER (WHERE sc.id IS NOT NULL),
                '[]'
              ) AS scans
       FROM patrol_sessions ps
       LEFT JOIN patrol_scans sc ON sc.session_id = ps.id
       WHERE ps.employee_id = $1 AND ps.patrol_date = CURRENT_DATE
       GROUP BY ps.id`,
      [employeeId],
    ),
  ]);

  const todayIsoDay = Number(
    (await queryOne<{ dow: string }>(`SELECT EXTRACT(ISODOW FROM CURRENT_DATE)::text AS dow`))?.dow ?? '1',
  );

  res.json({
    location: assignment,
    // Every active round with the days it runs, for the device to build its
    // reminder alarms. `routes[].rounds` is filtered to today for the screen and
    // is deliberately not reused here: scheduling from it would set an alarm on
    // every day of the week regardless of the real schedule.
    reminders: scheduleRows.map((schedule) => ({
      schedule_id: schedule.id,
      route_id: schedule.route_id,
      route_name: routeRows.find((route) => route.id === schedule.route_id)?.route_name ?? '',
      start_time: schedule.start_time,
      days_of_week: schedule.days_of_week as number[],
    })),
    routes: routeRows.map((route) => ({
      ...route,
      checkpoints: checkpointRows
        .filter((checkpoint) => checkpoint.route_id === route.id)
        .map(({ qr_token: token, ...checkpoint }) => ({
          ...checkpoint,
          qr_token_hash: qrTokenHash(token),
        })),
      rounds: scheduleRows
        .filter((schedule) => schedule.route_id === route.id)
        .filter((schedule) => (schedule.days_of_week as number[]).includes(todayIsoDay))
        .map((schedule) => ({
          schedule_id: schedule.id,
          start_time: schedule.start_time,
          session: sessionRows.find((session) => session.schedule_id === schedule.id) ?? null,
        })),
      // Rounds walked outside any schedule, e.g. after an incident.
      unscheduled_sessions: sessionRows.filter(
        (session) => session.route_id === route.id && session.schedule_id === null,
      ),
    })),
  });
}));

const startSchema = z.object({
  client_uuid: z.string().uuid(),
  route_id: id,
  schedule_id: id.nullable().optional(),
  started_at: z.string().datetime({ offset: true }),
});

// How far a device clock may sit from the server's before a round is refused.
// Generous in the past, because a genuinely offline site can go days without
// signal; tight in the future, because only a wrong or tampered clock is ahead.
const MAX_CLOCK_LAG_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_CLOCK_LEAD_MS = 24 * 60 * 60 * 1000;

const assertPlausibleDeviceTime = (value: string, label: string) => {
  const skew = new Date(value).getTime() - Date.now();
  if (Number.isNaN(skew)) throw new HttpError(400, `${label} is not a valid time`);
  if (skew > MAX_CLOCK_LEAD_MS) {
    throw new HttpError(422, `Your phone's clock is ahead of real time. Correct the date and time, then try again.`);
  }
  if (skew < -MAX_CLOCK_LAG_MS) {
    throw new HttpError(422, `This patrol is too old to record. Check your phone's date and time.`);
  }
};

/**
 * Starts (or resumes) a round. Idempotent twice over: the device's client_uuid
 * survives offline retries, and a reinstall that generates a fresh uuid still
 * resumes the existing round for that scheduled slot rather than opening a
 * second one.
 *
 * patrol_date comes from the guard's own clock, not from when this request
 * arrives. A round walked at 23:45 with no signal and uploaded the next morning
 * belongs to the night it was walked; filing it on the upload date would report
 * the real round as missed and invent a second one on the following day.
 */
router.post('/my/sessions', requireField, validate(startSchema), asyncHandler(async (req, res) => {
  const employeeId = actingEmployeeId(req);
  const body = req.body as z.infer<typeof startSchema>;
  assertPlausibleDeviceTime(body.started_at, 'The patrol start time');

  const session = await withTransaction(async (tx) => {
    const assignment = await activeAssignment(tx, employeeId);
    if (!assignment) throw new HttpError(409, 'You are not currently posted to any site');

    const route = await tx.queryOne<{ id: number; location_id: number }>(
      `SELECT id, location_id FROM patrol_routes WHERE id = $1 AND is_active`,
      [body.route_id],
    );
    if (!route) throw new HttpError(404, 'Patrol route not found');
    if (route.location_id !== assignment.location_id) {
      throw new HttpError(403, 'This route belongs to a site you are not posted to');
    }

    if (body.schedule_id != null) {
      const schedule = await tx.queryOne<{ id: number }>(
        `SELECT id FROM patrol_schedules WHERE id = $1 AND route_id = $2 AND is_active`,
        [body.schedule_id, body.route_id],
      );
      if (!schedule) throw new HttpError(404, 'Patrol schedule not found for this route');
    }

    // The connection runs in the agency business time zone, so casting the
    // device's timestamp to a date yields the local day the guard walked it.
    const existing = await tx.queryOne(
      `SELECT * FROM patrol_sessions
       WHERE client_uuid = $1
          OR (employee_id = $2 AND patrol_date = ($4::timestamptz)::date
              AND schedule_id IS NOT DISTINCT FROM $3::int AND $3::int IS NOT NULL)
       LIMIT 1`,
      [body.client_uuid, employeeId, body.schedule_id ?? null, body.started_at],
    );
    if (existing) return existing;

    return tx.queryOne(
      `INSERT INTO patrol_sessions
         (route_id, schedule_id, employee_id, patrol_date, client_uuid, started_at)
       VALUES ($1, $2, $3, ($5::timestamptz)::date, $4, $5)
       RETURNING *`,
      [body.route_id, body.schedule_id ?? null, employeeId, body.client_uuid, body.started_at],
    );
  });

  res.status(201).json(session);
}));

const scanSchema = z.object({
  session_client_uuid: z.string().uuid(),
  qr_payload: z.string().min(1).max(200),
  scanned_at: z.string().datetime({ offset: true }),
  photo: z.string().min(1),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
});

/**
 * Records one checkpoint. The QR payload is the credential, so the checkpoint is
 * resolved from the scanned token and never from a client-supplied id.
 *
 * A scan is accepted even after the round was closed. Whether the guard was on
 * time is judged by scanned_at — their clock at the checkpoint — not by when the
 * upload arrived, so a round walked correctly in a dead zone reads as on time
 * once it syncs. server_received_at is kept alongside it so a supervisor can
 * still see the gap.
 */
router.post('/my/scans', requireField, validate(scanSchema), asyncHandler(async (req, res) => {
  const employeeId = actingEmployeeId(req);
  const body = req.body as z.infer<typeof scanSchema>;
  assertPlausibleDeviceTime(body.scanned_at, 'The scan time');

  if (!body.qr_payload.startsWith(CHECKPOINT_QR_PREFIX)) {
    throw new HttpError(422, 'That QR code is not a patrol checkpoint');
  }
  const token = body.qr_payload.slice(CHECKPOINT_QR_PREFIX.length);

  // The selfie is a stored upload reference, never a caller-chosen file path.
  const photo = canonicalUploadPath(body.photo);
  if (!photo) throw new HttpError(400, 'Attach the checkpoint photo as an uploaded file');

  const result = await withTransaction(async (tx) => {
    const session = await tx.queryOne<{
      id: number; route_id: number; employee_id: number; completed_at: string | null;
    }>(
      `SELECT id, route_id, employee_id, completed_at
       FROM patrol_sessions WHERE client_uuid = $1 FOR UPDATE`,
      [body.session_client_uuid],
    );
    if (!session) throw new HttpError(404, 'Start the patrol before scanning a checkpoint');
    if (session.employee_id !== employeeId) {
      throw new HttpError(403, 'This patrol belongs to another guard');
    }

    const checkpoint = await tx.queryOne<{
      id: number; route_id: number; checkpoint_name: string; sequence: number;
      latitude: string | null; longitude: string | null;
    }>(
      `SELECT c.id, c.route_id, c.checkpoint_name, c.sequence, c.latitude, c.longitude
       FROM patrol_checkpoints c
       WHERE c.qr_token = $1 AND c.is_active`,
      [token],
    );
    if (!checkpoint) throw new HttpError(404, 'This checkpoint code is not recognised');
    if (checkpoint.route_id !== session.route_id) {
      throw new HttpError(422, 'That checkpoint is not on the route you are patrolling');
    }

    const route = await tx.queryOne<{ geofence_metres: number }>(
      `SELECT geofence_metres FROM patrol_routes WHERE id = $1`,
      [session.route_id],
    );

    let distance: number | null = null;
    if (checkpoint.latitude !== null && checkpoint.longitude !== null) {
      if (body.latitude == null || body.longitude == null) {
        throw new HttpError(422, 'Turn on location to scan this checkpoint');
      }
      distance = haversineMetres(
        { latitude: body.latitude, longitude: body.longitude },
        { latitude: Number(checkpoint.latitude), longitude: Number(checkpoint.longitude) },
      );
      const limit = route?.geofence_metres ?? 75;
      if (distance > limit) {
        throw new HttpError(
          422,
          `You are about ${Math.round(distance)} m from ${checkpoint.checkpoint_name}. Move closer and scan again.`,
        );
      }
    }

    // A replayed offline upload collapses onto the scan already accepted.
    const inserted = await tx.queryOne(
      `INSERT INTO patrol_scans
         (session_id, checkpoint_id, scanned_at, photo, latitude, longitude, distance_metres)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (session_id, checkpoint_id) DO NOTHING
       RETURNING *`,
      [
        session.id, checkpoint.id, body.scanned_at, photo,
        body.latitude ?? null, body.longitude ?? null,
        distance === null ? null : Number(distance.toFixed(1)),
      ],
    );
    const scan = inserted ?? await tx.queryOne(
      `SELECT * FROM patrol_scans WHERE session_id = $1 AND checkpoint_id = $2`,
      [session.id, checkpoint.id],
    );

    const remaining = await tx.queryOne<{ remaining: number }>(
      `SELECT (SELECT COUNT(*) FROM patrol_checkpoints c
                WHERE c.route_id = $1 AND c.is_active)
            - (SELECT COUNT(*) FROM patrol_scans sc WHERE sc.session_id = $2) AS remaining`,
      [session.route_id, session.id],
    );

    return {
      scan,
      checkpoint: {
        id: checkpoint.id,
        checkpoint_name: checkpoint.checkpoint_name,
        sequence: checkpoint.sequence,
      },
      remaining: Math.max(0, Number(remaining?.remaining ?? 0)),
      duplicate: !inserted,
    };
  });

  res.status(result.duplicate ? 200 : 201).json(result);
}));

/** Closes a round. Safe to call again after an offline retry. */
router.post('/my/sessions/:clientUuid/complete', requireField, asyncHandler(async (req, res) => {
  const employeeId = actingEmployeeId(req);
  const clientUuid = parseInput(z.string().uuid(), req.params.clientUuid, 'clientUuid');

  const session = await withTransaction(async (tx) => {
    const existing = await tx.queryOne<{ id: number; employee_id: number; completed_at: string | null }>(
      `SELECT id, employee_id, completed_at FROM patrol_sessions WHERE client_uuid = $1 FOR UPDATE`,
      [clientUuid],
    );
    if (!existing) throw new HttpError(404, 'Patrol session not found');
    if (existing.employee_id !== employeeId) {
      throw new HttpError(403, 'This patrol belongs to another guard');
    }
    if (existing.completed_at) return existing;

    return tx.queryOne(
      `UPDATE patrol_sessions SET completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [existing.id],
    );
  });

  res.json(session);
}));

export default router;
