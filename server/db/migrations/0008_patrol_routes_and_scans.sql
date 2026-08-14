-- Guard patrols: an admin defines routes of physical QR checkpoints for a site
-- and the times they must be walked. Guards scan each checkpoint in person and
-- attach a selfie, which is the evidence that the round actually happened.
--
-- Expected patrols are NOT stored. A patrol that should have happened is the
-- join of patrol_schedules x an active employee_assignment x a calendar date,
-- computed at read time. Only real attempts create rows here, so there is no
-- cron job inventing "missed" records and no backfill when a schedule changes.

CREATE TABLE IF NOT EXISTS patrol_routes (
    id SERIAL PRIMARY KEY,

    location_id INT NOT NULL,

    route_name VARCHAR(150) NOT NULL,

    description TEXT,

    -- How far from a checkpoint's recorded position a scan is still accepted.
    -- Route-level because every checkpoint on one site shares the same GPS
    -- quality; a dense urban site can be tightened without touching each stop.
    geofence_metres INT NOT NULL DEFAULT 75,

    -- Minutes after the scheduled start that the round may still be walked.
    grace_minutes INT NOT NULL DEFAULT 30,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_patrol_route_location
        FOREIGN KEY (location_id) REFERENCES locations(id),

    CONSTRAINT patrol_routes_name_per_location UNIQUE (location_id, route_name),
    CONSTRAINT patrol_routes_geofence_sane CHECK (geofence_metres BETWEEN 10 AND 2000),
    CONSTRAINT patrol_routes_grace_sane CHECK (grace_minutes BETWEEN 5 AND 720)
);

CREATE TABLE IF NOT EXISTS patrol_checkpoints (
    id SERIAL PRIMARY KEY,

    route_id INT NOT NULL,

    checkpoint_name VARCHAR(150) NOT NULL,

    -- Walking order. Guards are not blocked from scanning out of order, but the
    -- supervisor report compares scan order against this to spot shortcuts.
    sequence INT NOT NULL,

    -- Printed into the QR sticker. Random and unguessable: possession of the
    -- token is what proves the guard stood in front of the physical placard,
    -- so a sequential id would let anyone forge a checkpoint.
    qr_token TEXT NOT NULL,

    -- Captured by the admin's device while standing at the checkpoint. NULL
    -- means location was never recorded, and scans there fall back to QR-only.
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_patrol_checkpoint_route
        FOREIGN KEY (route_id) REFERENCES patrol_routes(id) ON DELETE CASCADE,

    CONSTRAINT patrol_checkpoints_token_unique UNIQUE (qr_token),
    CONSTRAINT patrol_checkpoints_sequence_per_route UNIQUE (route_id, sequence),
    CONSTRAINT patrol_checkpoints_sequence_positive CHECK (sequence > 0),
    CONSTRAINT patrol_checkpoints_token_length CHECK (char_length(qr_token) BETWEEN 16 AND 128),
    -- A half-recorded position would silently disable the geofence for one stop.
    CONSTRAINT patrol_checkpoints_coords_paired CHECK (
        (latitude IS NULL) = (longitude IS NULL)
    ),
    CONSTRAINT patrol_checkpoints_latitude_range CHECK (
        latitude IS NULL OR latitude BETWEEN -90 AND 90
    ),
    CONSTRAINT patrol_checkpoints_longitude_range CHECK (
        longitude IS NULL OR longitude BETWEEN -180 AND 180
    )
);

CREATE TABLE IF NOT EXISTS patrol_schedules (
    id SERIAL PRIMARY KEY,

    route_id INT NOT NULL,

    -- Local wall-clock start of the round, in the agency business time zone.
    start_time TIME NOT NULL,

    -- ISO weekday numbers (1 = Monday .. 7 = Sunday) the round runs on.
    -- Defaults to every day, which is the norm for a guarded site.
    days_of_week SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7],

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_patrol_schedule_route
        FOREIGN KEY (route_id) REFERENCES patrol_routes(id) ON DELETE CASCADE,

    CONSTRAINT patrol_schedules_time_per_route UNIQUE (route_id, start_time),
    CONSTRAINT patrol_schedules_days_valid CHECK (
        array_length(days_of_week, 1) BETWEEN 1 AND 7
        AND days_of_week <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]
    )
);

CREATE TABLE IF NOT EXISTS patrol_sessions (
    id SERIAL PRIMARY KEY,

    route_id INT NOT NULL,

    -- Which scheduled round this attempt belongs to. NULL for an unscheduled
    -- extra round, which supervisors do ask for after an incident.
    schedule_id INT,

    employee_id INT NOT NULL,

    -- Business-day date of the round, so a 23:45 patrol and its 00:10 scans
    -- stay one session instead of splitting across midnight.
    patrol_date DATE NOT NULL,

    -- Generated on the guard's device so a round begun with no signal keeps one
    -- identity across retries. This is the idempotency key for session upserts.
    client_uuid UUID NOT NULL,

    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_patrol_session_route
        FOREIGN KEY (route_id) REFERENCES patrol_routes(id),
    CONSTRAINT fk_patrol_session_schedule
        FOREIGN KEY (schedule_id) REFERENCES patrol_schedules(id) ON DELETE SET NULL,
    CONSTRAINT fk_patrol_session_employee
        FOREIGN KEY (employee_id) REFERENCES employees(id),

    CONSTRAINT patrol_sessions_client_uuid_unique UNIQUE (client_uuid),
    -- One attempt per guard per scheduled slot. A second tap of "start" after a
    -- crash must resume the same round, never open a parallel one.
    CONSTRAINT patrol_sessions_one_per_slot UNIQUE (employee_id, patrol_date, schedule_id)
);

CREATE TABLE IF NOT EXISTS patrol_scans (
    id SERIAL PRIMARY KEY,

    session_id INT NOT NULL,

    checkpoint_id INT NOT NULL,

    -- Device clock at the moment of the scan. Trusted for ordering within a
    -- round only; server_received_at is the authority for "was this on time".
    scanned_at TIMESTAMPTZ NOT NULL,

    -- Diverges from scanned_at exactly when the scan was queued offline. A wide
    -- gap is the signal for a supervisor to look at the photo more closely.
    server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Mandatory proof of presence. An upload path, same signed-URL scheme as
    -- employee photos, never a raw file name.
    photo TEXT NOT NULL,

    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),

    -- Metres between the guard and the checkpoint at scan time, resolved on the
    -- server. Stored because a later edit to the checkpoint's recorded position
    -- must not silently rewrite whether a past scan was inside the fence.
    distance_metres NUMERIC(8,1),

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_patrol_scan_session
        FOREIGN KEY (session_id) REFERENCES patrol_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_patrol_scan_checkpoint
        FOREIGN KEY (checkpoint_id) REFERENCES patrol_checkpoints(id),

    -- Replayed offline uploads collapse onto the first accepted scan.
    CONSTRAINT patrol_scans_one_per_checkpoint UNIQUE (session_id, checkpoint_id),
    CONSTRAINT patrol_scans_coords_paired CHECK (
        (latitude IS NULL) = (longitude IS NULL)
    ),
    CONSTRAINT patrol_scans_latitude_range CHECK (
        latitude IS NULL OR latitude BETWEEN -90 AND 90
    ),
    CONSTRAINT patrol_scans_longitude_range CHECK (
        longitude IS NULL OR longitude BETWEEN -180 AND 180
    ),
    CONSTRAINT patrol_scans_distance_nonnegative CHECK (
        distance_metres IS NULL OR distance_metres >= 0
    )
);

-- A scan must belong to the same route as its session, which no foreign key can
-- express on its own. Without this a replayed payload could attach a checkpoint
-- from another site's route to a session and quietly complete it.
CREATE OR REPLACE FUNCTION validate_patrol_scan_route()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    session_route_id INT;
    checkpoint_route_id INT;
BEGIN
    SELECT route_id INTO session_route_id
    FROM patrol_sessions
    WHERE id = NEW.session_id
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Patrol session % does not exist', NEW.session_id;
    END IF;

    SELECT route_id INTO checkpoint_route_id
    FROM patrol_checkpoints
    WHERE id = NEW.checkpoint_id
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Patrol checkpoint % does not exist', NEW.checkpoint_id;
    END IF;

    IF session_route_id <> checkpoint_route_id THEN
        RAISE EXCEPTION 'Checkpoint % does not belong to the patrolled route', NEW.checkpoint_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patrol_scans_route_guard ON patrol_scans;
CREATE TRIGGER patrol_scans_route_guard
    BEFORE INSERT OR UPDATE ON patrol_scans
    FOR EACH ROW
    EXECUTE FUNCTION validate_patrol_scan_route();

CREATE INDEX IF NOT EXISTS idx_patrol_routes_location ON patrol_routes(location_id);
CREATE INDEX IF NOT EXISTS idx_patrol_checkpoints_route ON patrol_checkpoints(route_id, sequence);
CREATE INDEX IF NOT EXISTS idx_patrol_schedules_route ON patrol_schedules(route_id);
CREATE INDEX IF NOT EXISTS idx_patrol_sessions_employee_date ON patrol_sessions(employee_id, patrol_date);
CREATE INDEX IF NOT EXISTS idx_patrol_sessions_route_date ON patrol_sessions(route_id, patrol_date);
CREATE INDEX IF NOT EXISTS idx_patrol_scans_session ON patrol_scans(session_id);
CREATE INDEX IF NOT EXISTS idx_patrol_scans_checkpoint ON patrol_scans(checkpoint_id);
