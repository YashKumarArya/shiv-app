-- Security Agency Management System — PostgreSQL schema
-- Based on the root schema.sql, with additions:
--   * app_users.role ('admin' | 'staff')
--   * updated_at on every table (the generic CRUD layer sets it on update)
--   * UNIQUE constraints: one attendance row per employee per day,
--     salary payments support multiple installments per employee per month
-- Current-schema reference for humans and database tools.
-- Do not execute this file during deployment. Ordered production changes live in
-- db/migrations and are applied explicitly with `npm run db:migrate`/`db:setup`.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version BIGINT PRIMARY KEY CHECK (version > 0),
    name TEXT NOT NULL UNIQUE,
    checksum CHAR(64) NOT NULL CHECK (length(checksum) = 64),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    execution_time_ms INTEGER NOT NULL CHECK (execution_time_ms >= 0)
);

-- Office roles (admin, staff) sign in with email. Field roles (supervisor,
-- guard) sign in with phone and are permanently bound to one employee row --
-- employee_id is the key every self-scoped query uses, so a guard can never
-- widen their own access by passing a different id.
CREATE TABLE IF NOT EXISTS app_users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE,
    phone VARCHAR(15),
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'staff'
        CHECK (role IN ('admin', 'staff', 'supervisor', 'guard')),
    -- Foreign key added after employees is created, further down this file.
    employee_id INT,
    status BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT app_users_field_role_employee_check
        CHECK ((role IN ('guard', 'supervisor')) = (employee_id IS NOT NULL)),
    CONSTRAINT app_users_identifier_check
        CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS designations (
    id SERIAL PRIMARY KEY,
    designation_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    default_salary DECIMAL(10,2) CHECK (default_salary >= 0),
    uniform_required BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backs auto-generated employee codes (EMP0001, EMP0002, …)
CREATE SEQUENCE IF NOT EXISTS employee_code_seq;

CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(30) UNIQUE NOT NULL,
    designation_id INT NOT NULL REFERENCES designations(id),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    phone VARCHAR(15),
    alternate_phone VARCHAR(15),
    email VARCHAR(150),
    date_of_birth DATE,
    joining_date DATE NOT NULL,
    salary DECIMAL(10,2) CHECK (salary >= 0),
    aadhaar_number VARCHAR(20),
    blood_group VARCHAR(5),
    address TEXT,
    photo TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Older installations predate this column.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS blood_group VARCHAR(5);

CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    site_name VARCHAR(150) NOT NULL,
    client_name VARCHAR(150),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    contact_person VARCHAR(100),
    contact_number VARCHAR(15),
    status BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_assignments (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id),
    location_id INT NOT NULL REFERENCES locations(id),
    shift VARCHAR(50),
    start_date DATE NOT NULL,
    end_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Ended')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (end_date IS NULL OR end_date >= start_date),
    CHECK ((status = 'Active' AND end_date IS NULL) OR (status = 'Ended' AND end_date IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id),
    location_id INT REFERENCES locations(id),
    attendance_date DATE NOT NULL,
    check_in TIME,
    check_out TIME,
    status VARCHAR(20) NOT NULL CHECK (status IN ('Present', 'Absent', 'Half Day', 'Leave')),
    remarks TEXT,
    marked_by INT REFERENCES app_users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (employee_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id),
    payment_month INT NOT NULL CHECK (payment_month BETWEEN 1 AND 12),
    payment_year INT NOT NULL CHECK (payment_year BETWEEN 2000 AND 2100),
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    payment_date DATE,
    payment_mode VARCHAR(50),
    transaction_reference VARCHAR(200),
    payment_proof TEXT,
    remarks TEXT,
    entry_type VARCHAR(20) NOT NULL DEFAULT 'payment'
        CHECK (entry_type IN ('payment', 'reversal')),
    reverses_payment_id INT REFERENCES payments(id) ON DELETE RESTRICT,
    reversal_reason TEXT,
    idempotency_key VARCHAR(100),
    created_by INT REFERENCES app_users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payments_reversal_shape_check CHECK (
        (entry_type = 'payment' AND reverses_payment_id IS NULL AND reversal_reason IS NULL)
        OR
        (entry_type = 'reversal' AND reverses_payment_id IS NOT NULL
            AND NULLIF(BTRIM(reversal_reason), '') IS NOT NULL)
    ),
    CONSTRAINT payments_idempotency_key_check CHECK (
        idempotency_key IS NULL
        OR (NULLIF(BTRIM(idempotency_key), '') IS NOT NULL AND created_by IS NOT NULL)
    )
);

-- Older installations used one row per employee/month. Salary tracking now keeps
-- an installment ledger and totals the rows for the selected period.
ALTER TABLE payments
    DROP CONSTRAINT IF EXISTS payments_employee_id_payment_month_payment_year_key;

CREATE TABLE IF NOT EXISTS payroll_snapshots (
    id BIGSERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    payment_month INT NOT NULL CHECK (payment_month BETWEEN 1 AND 12),
    payment_year INT NOT NULL CHECK (payment_year BETWEEN 2000 AND 2100),
    designation_id INT REFERENCES designations(id) ON DELETE SET NULL,
    designation_name VARCHAR(100),
    employee_salary NUMERIC(10,2) CHECK (employee_salary >= 0),
    designation_salary NUMERIC(10,2) CHECK (designation_salary >= 0),
    effective_salary NUMERIC(10,2) CHECK (effective_salary >= 0),
    salary_exclude_sundays BOOLEAN NOT NULL,
    salary_off_days INT NOT NULL CHECK (salary_off_days BETWEEN 0 AND 30),
    payable_days INT NOT NULL CHECK (payable_days > 0),
    worked_days NUMERIC(7,2) NOT NULL CHECK (worked_days >= 0),
    due_amount NUMERIC(12,2) NOT NULL CHECK (due_amount >= 0),
    finalization_reason VARCHAR(30) NOT NULL
        CHECK (finalization_reason IN ('period_closed', 'payment_recorded', 'manual', 'migration')),
    finalized_by INT REFERENCES app_users(id) ON DELETE SET NULL,
    finalized_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payroll_snapshots_employee_period_key
        UNIQUE (employee_id, payment_year, payment_month),
    CONSTRAINT payroll_snapshots_approval_identity_key
        UNIQUE (id, employee_id, payment_year, payment_month)
);

CREATE TABLE IF NOT EXISTS payroll_period_approvals (
    id BIGSERIAL PRIMARY KEY,
    payroll_snapshot_id BIGINT NOT NULL,
    employee_id INT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    payment_month INT NOT NULL CHECK (payment_month BETWEEN 1 AND 12),
    payment_year INT NOT NULL CHECK (payment_year BETWEEN 2000 AND 2100),
    approval_source VARCHAR(20) NOT NULL CHECK (approval_source IN ('manual', 'migration')),
    approved_by INT REFERENCES app_users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payroll_period_approvals_snapshot_key UNIQUE (payroll_snapshot_id),
    CONSTRAINT payroll_period_approvals_employee_period_key
        UNIQUE (employee_id, payment_year, payment_month),
    CONSTRAINT payroll_period_approvals_source_check CHECK (
        approval_source = 'migration'
        OR (approval_source = 'manual' AND approved_by IS NOT NULL)
    ),
    CONSTRAINT payroll_period_approvals_snapshot_fkey
        FOREIGN KEY (payroll_snapshot_id, employee_id, payment_year, payment_month)
        REFERENCES payroll_snapshots(id, employee_id, payment_year, payment_month)
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS payment_audit_log (
    id BIGSERIAL PRIMARY KEY,
    payment_id INT NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    action VARCHAR(30) NOT NULL CHECK (action IN ('recorded', 'reversed', 'imported')),
    actor_user_id INT REFERENCES app_users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payment_audit_log_payment_action_key UNIQUE (payment_id, action)
);

CREATE TABLE IF NOT EXISTS employee_documents (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id),
    document_type VARCHAR(100),
    document_number VARCHAR(100),
    document_file TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uniform_issues (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id),
    issued_date DATE NOT NULL,
    issued_by INT REFERENCES app_users(id),
    uniform_size VARCHAR(20),
    remarks TEXT,
    returned BOOLEAN NOT NULL DEFAULT FALSE,
    returned_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (returned_date IS NULL OR returned_date >= issued_date),
    CHECK ((returned = FALSE AND returned_date IS NULL) OR (returned = TRUE AND returned_date IS NOT NULL))
);

-- App-wide configuration: salary_exclude_sundays (true|false) and
-- salary_off_days (extra non-working days per month) combine additively —
-- payable days = days in month − Sundays (if excluded) − extra days.
-- Plus the company_* keys used to brand printable employee ID cards.
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PATROL ROUTES, CHECKPOINTS AND SCANS
-- ============================================

-- Expected patrols are not stored. A round that should have happened is the
-- join of patrol_schedules x an active employee_assignment x a calendar date,
-- computed at read time; only real attempts create session and scan rows.
CREATE TABLE IF NOT EXISTS patrol_routes (
    id SERIAL PRIMARY KEY,
    location_id INT NOT NULL REFERENCES locations(id),
    route_name VARCHAR(150) NOT NULL,
    description TEXT,
    geofence_metres INT NOT NULL DEFAULT 75,
    grace_minutes INT NOT NULL DEFAULT 30,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT patrol_routes_name_per_location UNIQUE (location_id, route_name),
    CONSTRAINT patrol_routes_geofence_sane CHECK (geofence_metres BETWEEN 10 AND 2000),
    CONSTRAINT patrol_routes_grace_sane CHECK (grace_minutes BETWEEN 5 AND 720)
);

-- qr_token is printed into the physical sticker and is random by design:
-- possession of it is what proves the guard stood in front of the placard.
CREATE TABLE IF NOT EXISTS patrol_checkpoints (
    id SERIAL PRIMARY KEY,
    route_id INT NOT NULL REFERENCES patrol_routes(id) ON DELETE CASCADE,
    checkpoint_name VARCHAR(150) NOT NULL,
    sequence INT NOT NULL,
    qr_token TEXT NOT NULL,
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT patrol_checkpoints_token_unique UNIQUE (qr_token),
    CONSTRAINT patrol_checkpoints_sequence_per_route UNIQUE (route_id, sequence),
    CONSTRAINT patrol_checkpoints_sequence_positive CHECK (sequence > 0),
    CONSTRAINT patrol_checkpoints_token_length CHECK (char_length(qr_token) BETWEEN 16 AND 128),
    CONSTRAINT patrol_checkpoints_coords_paired CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CONSTRAINT patrol_checkpoints_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT patrol_checkpoints_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS patrol_schedules (
    id SERIAL PRIMARY KEY,
    route_id INT NOT NULL REFERENCES patrol_routes(id) ON DELETE CASCADE,
    start_time TIME NOT NULL,
    days_of_week SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7],
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT patrol_schedules_time_per_route UNIQUE (route_id, start_time),
    CONSTRAINT patrol_schedules_days_valid CHECK (
        array_length(days_of_week, 1) BETWEEN 1 AND 7
        AND days_of_week <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]
    )
);

-- client_uuid is generated on the guard's device so a round begun with no
-- signal keeps one identity across retries.
CREATE TABLE IF NOT EXISTS patrol_sessions (
    id SERIAL PRIMARY KEY,
    route_id INT NOT NULL REFERENCES patrol_routes(id),
    schedule_id INT REFERENCES patrol_schedules(id) ON DELETE SET NULL,
    employee_id INT NOT NULL REFERENCES employees(id),
    patrol_date DATE NOT NULL,
    client_uuid UUID NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT patrol_sessions_client_uuid_unique UNIQUE (client_uuid),
    CONSTRAINT patrol_sessions_one_per_slot UNIQUE (employee_id, patrol_date, schedule_id)
);

-- distance_metres is resolved on the server and stored, so later edits to a
-- checkpoint's recorded position cannot rewrite whether a past scan was inside
-- the fence.
CREATE TABLE IF NOT EXISTS patrol_scans (
    id SERIAL PRIMARY KEY,
    session_id INT NOT NULL REFERENCES patrol_sessions(id) ON DELETE CASCADE,
    checkpoint_id INT NOT NULL REFERENCES patrol_checkpoints(id),
    scanned_at TIMESTAMPTZ NOT NULL,
    server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    photo TEXT NOT NULL,
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),
    distance_metres NUMERIC(8,1),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT patrol_scans_one_per_checkpoint UNIQUE (session_id, checkpoint_id),
    CONSTRAINT patrol_scans_coords_paired CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CONSTRAINT patrol_scans_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT patrol_scans_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    CONSTRAINT patrol_scans_distance_nonnegative CHECK (distance_metres IS NULL OR distance_metres >= 0)
);

-- Non-destructive compatibility for installations created from the original
-- root schema before the API added roles and generic updated_at writes.
ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'staff';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS employee_id INT;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_app_user_employee' AND conrelid = 'app_users'::regclass
    ) THEN
        ALTER TABLE app_users
            ADD CONSTRAINT fk_app_user_employee
            FOREIGN KEY (employee_id) REFERENCES employees(id);
    END IF;
END $$;
ALTER TABLE employee_assignments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE uniform_issues ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE SEQUENCE IF NOT EXISTS quotation_number_seq START WITH 1;

CREATE TABLE IF NOT EXISTS quotations (
    id SERIAL PRIMARY KEY,
    quotation_number VARCHAR(30) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Issued')),
    quotation_date DATE NOT NULL,
    valid_until DATE,
    title VARCHAR(120) NOT NULL,
    client_name VARCHAR(150) NOT NULL,
    client_address TEXT,
    client_gst_number VARCHAR(30),
    client_contact_name VARCHAR(120),
    client_phone VARCHAR(30),
    client_email VARCHAR(200),
    services JSONB NOT NULL CHECK (jsonb_typeof(services) = 'array'),
    cost_heads JSONB NOT NULL CHECK (jsonb_typeof(cost_heads) = 'array'),
    calculation JSONB NOT NULL CHECK (jsonb_typeof(calculation) = 'object'),
    company_snapshot JSONB NOT NULL CHECK (jsonb_typeof(company_snapshot) = 'object'),
    terms TEXT,
    created_by INT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (valid_until IS NULL OR valid_until >= quotation_date),
    CHECK ((status = 'Issued') = (issued_at IS NOT NULL))
);

-- Superseded by salary_exclude_sundays + salary_off_days.
DELETE FROM app_settings WHERE key = 'salary_off_mode';

INSERT INTO app_settings (key, value) VALUES
    ('salary_exclude_sundays', 'false'),
    ('salary_off_days', '0'),
    ('company_name', ''),
    ('company_address', ''),
    ('company_phone', ''),
    ('company_email', ''),
    ('company_gst_number', ''),
    ('company_tagline', ''),
    ('company_logo', ''),
    ('company_signature', '')
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_assignments_employee ON employee_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_employee_id_attendance_date_key
    ON attendance(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_payments_employee_period
    ON payments(employee_id, payment_year, payment_month);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_reversal
    ON payments(reverses_payment_id) WHERE reverses_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency_key
    ON payments(created_by, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND entry_type = 'payment';
CREATE INDEX IF NOT EXISTS idx_payroll_snapshots_period
    ON payroll_snapshots(payment_year, payment_month);
CREATE INDEX IF NOT EXISTS idx_payroll_period_approvals_period
    ON payroll_period_approvals(payment_year, payment_month);
CREATE INDEX IF NOT EXISTS idx_payment_audit_log_payment_created
    ON payment_audit_log(payment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_documents_employee ON employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_designation ON employees(designation_id);
CREATE INDEX IF NOT EXISTS idx_assignments_location ON employee_assignments(location_id);
CREATE INDEX IF NOT EXISTS idx_attendance_location ON attendance(location_id);
CREATE INDEX IF NOT EXISTS idx_uniforms_employee ON uniform_issues(employee_id);
CREATE INDEX IF NOT EXISTS idx_quotations_date ON quotations(quotation_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_client ON quotations(client_name);

CREATE OR REPLACE FUNCTION reject_issued_quotation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'Issued' THEN
        RAISE EXCEPTION 'Issued quotations are immutable; create a revision instead'
            USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS quotations_reject_issued_mutation ON quotations;
CREATE TRIGGER quotations_reject_issued_mutation
BEFORE UPDATE OR DELETE ON quotations
FOR EACH ROW EXECUTE FUNCTION reject_issued_quotation_change();
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email_ci ON app_users(LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_one_active_per_employee
    ON employee_assignments(employee_id) WHERE status = 'Active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_uniforms_one_outstanding_per_employee
    ON uniform_issues(employee_id) WHERE returned = FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS app_users_employee_unique
    ON app_users(employee_id) WHERE employee_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS app_users_phone_unique
    ON app_users(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_patrol_routes_location ON patrol_routes(location_id);
CREATE INDEX IF NOT EXISTS idx_patrol_checkpoints_route ON patrol_checkpoints(route_id, sequence);
CREATE INDEX IF NOT EXISTS idx_patrol_schedules_route ON patrol_schedules(route_id);
CREATE INDEX IF NOT EXISTS idx_patrol_sessions_employee_date ON patrol_sessions(employee_id, patrol_date);
CREATE INDEX IF NOT EXISTS idx_patrol_sessions_route_date ON patrol_sessions(route_id, patrol_date);
CREATE INDEX IF NOT EXISTS idx_patrol_scans_session ON patrol_scans(session_id);
CREATE INDEX IF NOT EXISTS idx_patrol_scans_checkpoint ON patrol_scans(checkpoint_id);

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
    FROM patrol_sessions WHERE id = NEW.session_id FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Patrol session % does not exist', NEW.session_id;
    END IF;

    SELECT route_id INTO checkpoint_route_id
    FROM patrol_checkpoints WHERE id = NEW.checkpoint_id FOR SHARE;
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

CREATE OR REPLACE FUNCTION validate_payment_ledger_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    original payments%ROWTYPE;
BEGIN
    IF NEW.entry_type = 'payment' THEN
        IF make_date(NEW.payment_year, NEW.payment_month, 1)
               > date_trunc('month', CURRENT_DATE)::date THEN
            RAISE EXCEPTION 'Future payroll payments are not allowed';
        END IF;
        IF make_date(NEW.payment_year, NEW.payment_month, 1)
               < date_trunc('month', CURRENT_DATE)::date
           AND NOT EXISTS (
               SELECT 1 FROM payroll_period_approvals approval
               WHERE approval.employee_id = NEW.employee_id
                 AND approval.payment_year = NEW.payment_year
                 AND approval.payment_month = NEW.payment_month
           ) THEN
            RAISE EXCEPTION 'Historical payments require an approved payroll period';
        END IF;
        RETURN NEW;
    END IF;
    SELECT * INTO original FROM payments
    WHERE id = NEW.reverses_payment_id FOR KEY SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reversed payment % does not exist', NEW.reverses_payment_id;
    END IF;
    IF original.entry_type <> 'payment' THEN
        RAISE EXCEPTION 'A reversal entry cannot reverse another reversal';
    END IF;
    IF NEW.employee_id <> original.employee_id
       OR NEW.payment_month <> original.payment_month
       OR NEW.payment_year <> original.payment_year THEN
        RAISE EXCEPTION 'A reversal must use the original payment employee and payroll period';
    END IF;
    IF NEW.amount <> original.amount THEN
        RAISE EXCEPTION 'A reversal must exactly offset the original payment amount';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION validate_payment_temporal_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    employee_joining_date DATE;
    original_payment_date DATE;
BEGIN
    IF NEW.created_by IS NULL THEN
        RAISE EXCEPTION 'A payment ledger entry requires an actor';
    END IF;
    IF NEW.payment_date IS NOT NULL AND NEW.payment_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'A payment ledger date cannot be in the future';
    END IF;
    IF NEW.entry_type = 'payment' THEN
        IF make_date(NEW.payment_year, NEW.payment_month, 1)
               > date_trunc('month', CURRENT_DATE)::date THEN
            RAISE EXCEPTION 'A payroll period cannot be in the future';
        END IF;
        SELECT joining_date INTO employee_joining_date
        FROM employees
        WHERE id = NEW.employee_id
        FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Employee % does not exist', NEW.employee_id;
        END IF;
        IF make_date(NEW.payment_year, NEW.payment_month, 1)
               < date_trunc('month', employee_joining_date)::date THEN
            RAISE EXCEPTION 'A payroll period cannot predate the employee joining month';
        END IF;
        IF NEW.payment_date IS NOT NULL AND NEW.payment_date < employee_joining_date THEN
            RAISE EXCEPTION 'A payment ledger date cannot predate the employee joining date';
        END IF;
    ELSIF NEW.entry_type = 'reversal' THEN
        IF NEW.payment_date IS NULL THEN
            RAISE EXCEPTION 'A reversal requires a reversal date';
        END IF;
        SELECT payment_date INTO original_payment_date
        FROM payments
        WHERE id = NEW.reverses_payment_id AND entry_type = 'payment'
        FOR KEY SHARE;
        IF FOUND
           AND original_payment_date IS NOT NULL
           AND NEW.payment_date < original_payment_date THEN
            RAISE EXCEPTION 'A reversal date cannot predate the original payment date';
        END IF;
    END IF;

    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION validate_employee_joining_date_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.joining_date IS NOT DISTINCT FROM OLD.joining_date THEN
        RETURN NEW;
    END IF;
    IF EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.employee_id = OLD.id AND a.attendance_date < NEW.joining_date
    ) OR EXISTS (
        SELECT 1 FROM payments p
        WHERE p.employee_id = OLD.id AND p.entry_type = 'payment'
          AND (
              (p.payment_date IS NOT NULL AND p.payment_date < NEW.joining_date)
              OR make_date(p.payment_year, p.payment_month, 1)
                    < date_trunc('month', NEW.joining_date)::date
          )
    ) OR EXISTS (
        SELECT 1 FROM payroll_snapshots ps
        WHERE ps.employee_id = OLD.id
          AND make_date(ps.payment_year, ps.payment_month, 1)
                < date_trunc('month', NEW.joining_date)::date
    ) OR EXISTS (
        SELECT 1 FROM employee_assignments ea
        WHERE ea.employee_id = OLD.id AND ea.start_date < NEW.joining_date
    ) THEN
        RAISE EXCEPTION 'Joining date cannot be later than existing employee history';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION validate_payroll_period_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.approval_source = 'manual'
       AND NOT EXISTS (
           SELECT 1 FROM app_users u
           WHERE u.id = NEW.approved_by AND u.role = 'admin' AND u.status = TRUE
       ) THEN
        RAISE EXCEPTION 'Manual payroll approval requires an active administrator';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION audit_payment_ledger_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO payment_audit_log (payment_id, action, actor_user_id, metadata)
    VALUES (
        NEW.id,
        CASE WHEN NEW.entry_type = 'reversal' THEN 'reversed' ELSE 'recorded' END,
        NEW.created_by,
        CASE WHEN NEW.entry_type = 'reversal'
             THEN jsonb_build_object(
                 'reverses_payment_id', NEW.reverses_payment_id,
                 'reversal_reason', NEW.reversal_reason
             )
             ELSE jsonb_build_object('entry_type', 'payment')
        END
    );
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION reject_immutable_financial_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION '% rows are append-only; create a reversal or a new migration instead', TG_TABLE_NAME
        USING ERRCODE = '55000';
END $$;

DROP TRIGGER IF EXISTS payments_validate_ledger_insert ON payments;
CREATE TRIGGER payments_validate_ledger_insert
BEFORE INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION validate_payment_ledger_entry();
DROP TRIGGER IF EXISTS payments_validate_temporal_insert ON payments;
CREATE TRIGGER payments_validate_temporal_insert
BEFORE INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION validate_payment_temporal_entry();
DROP TRIGGER IF EXISTS employees_validate_joining_date_change ON employees;
CREATE TRIGGER employees_validate_joining_date_change
BEFORE UPDATE OF joining_date ON employees
FOR EACH ROW
WHEN (NEW.joining_date IS DISTINCT FROM OLD.joining_date)
EXECUTE FUNCTION validate_employee_joining_date_change();
DROP TRIGGER IF EXISTS payments_audit_ledger_insert ON payments;
CREATE TRIGGER payments_audit_ledger_insert
AFTER INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION audit_payment_ledger_insert();
DROP TRIGGER IF EXISTS payments_reject_mutation ON payments;
CREATE TRIGGER payments_reject_mutation
BEFORE UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION reject_immutable_financial_change();
DROP TRIGGER IF EXISTS payroll_snapshots_reject_mutation ON payroll_snapshots;
CREATE TRIGGER payroll_snapshots_reject_mutation
BEFORE UPDATE OR DELETE ON payroll_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_immutable_financial_change();
DROP TRIGGER IF EXISTS payroll_period_approvals_validate_insert ON payroll_period_approvals;
CREATE TRIGGER payroll_period_approvals_validate_insert
BEFORE INSERT ON payroll_period_approvals
FOR EACH ROW EXECUTE FUNCTION validate_payroll_period_approval();
DROP TRIGGER IF EXISTS payroll_period_approvals_reject_mutation ON payroll_period_approvals;
CREATE TRIGGER payroll_period_approvals_reject_mutation
BEFORE UPDATE OR DELETE ON payroll_period_approvals
FOR EACH ROW EXECUTE FUNCTION reject_immutable_financial_change();
DROP TRIGGER IF EXISTS payment_audit_log_reject_mutation ON payment_audit_log;
CREATE TRIGGER payment_audit_log_reject_mutation
BEFORE UPDATE OR DELETE ON payment_audit_log
FOR EACH ROW EXECUTE FUNCTION reject_immutable_financial_change();

INSERT INTO designations (designation_name, default_salary, uniform_required) VALUES
    ('Security Guard', 18000, TRUE),
    ('Gunman', 25000, TRUE),
    ('Supervisor', 30000, TRUE),
    ('Housekeeping', 16000, FALSE)
ON CONFLICT (designation_name) DO NOTHING;
