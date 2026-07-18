-- Freeze historical payroll bases and turn mutable payment rows into an
-- append-only ledger. Historical salary/settings changes made before this
-- migration cannot be reconstructed: the backfill intentionally freezes the
-- values and attendance visible at migration time.

-- Wait for in-flight legacy writes and keep old application instances from
-- changing either side of the employee/payment validation until this migration
-- commits. Without these locks, a row could be inserted after the preflight but
-- before the immutable triggers are installed.
LOCK TABLE payments, employees IN SHARE ROW EXCLUSIVE MODE;

-- Abort before installing immutable triggers if legacy rows still contain
-- future or pre-employment payments. Those rows need an operator decision while
-- they are still editable; silently freezing them would create a ledger entry
-- with no defensible payroll basis (and a future-dated row could not yet be
-- reversed through the normal API).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM payments
        WHERE make_date(payment_year, payment_month, 1)
                  > date_trunc('month', CURRENT_DATE)::date
    ) THEN
        RAISE EXCEPTION 'Cannot create immutable payment ledger: future payroll-period payments exist; correct or remove them before migrating';
    END IF;
    IF EXISTS (
        SELECT 1 FROM payments
        WHERE payment_date > CURRENT_DATE
    ) THEN
        RAISE EXCEPTION 'Cannot create immutable payment ledger: future payment dates exist; correct them before migrating';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM payments p
        JOIN employees e ON e.id = p.employee_id
        WHERE make_date(p.payment_year, p.payment_month, 1)
                  < date_trunc('month', e.joining_date)::date
           OR (p.payment_date IS NOT NULL AND p.payment_date < e.joining_date)
    ) THEN
        RAISE EXCEPTION 'Cannot create immutable payment ledger: a payment period or date predates its employee joining date';
    END IF;
END $$;

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
        UNIQUE (employee_id, payment_year, payment_month)
);

CREATE INDEX IF NOT EXISTS idx_payroll_snapshots_period
    ON payroll_snapshots(payment_year, payment_month);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_snapshots_employee_period_key
    ON payroll_snapshots(employee_id, payment_year, payment_month);

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS entry_type VARCHAR(20) NOT NULL DEFAULT 'payment';
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS reverses_payment_id INT;
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

UPDATE payments SET entry_type = 'payment' WHERE entry_type IS NULL;
ALTER TABLE payments
    ALTER COLUMN entry_type SET DEFAULT 'payment',
    ALTER COLUMN entry_type SET NOT NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM payments WHERE entry_type NOT IN ('payment', 'reversal')) THEN
        RAISE EXCEPTION 'Cannot create payment ledger: unsupported entry_type values exist';
    END IF;
    IF EXISTS (
        SELECT 1 FROM payments
        WHERE (entry_type = 'payment' AND (reverses_payment_id IS NOT NULL OR reversal_reason IS NOT NULL))
           OR (entry_type = 'reversal' AND (reverses_payment_id IS NULL OR NULLIF(BTRIM(reversal_reason), '') IS NULL))
    ) THEN
        RAISE EXCEPTION 'Cannot create payment ledger: payment/reversal fields are inconsistent';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'payments_entry_type_check' AND conrelid = 'payments'::regclass
    ) THEN
        ALTER TABLE payments ADD CONSTRAINT payments_entry_type_check
            CHECK (entry_type IN ('payment', 'reversal'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'payments_reversal_shape_check' AND conrelid = 'payments'::regclass
    ) THEN
        ALTER TABLE payments ADD CONSTRAINT payments_reversal_shape_check CHECK (
            (entry_type = 'payment' AND reverses_payment_id IS NULL AND reversal_reason IS NULL)
            OR
            (entry_type = 'reversal' AND reverses_payment_id IS NOT NULL
                AND NULLIF(BTRIM(reversal_reason), '') IS NOT NULL)
        );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'payments_reverses_payment_id_fkey' AND conrelid = 'payments'::regclass
    ) THEN
        ALTER TABLE payments ADD CONSTRAINT payments_reverses_payment_id_fkey
            FOREIGN KEY (reverses_payment_id) REFERENCES payments(id) ON DELETE RESTRICT;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_reversal
    ON payments(reverses_payment_id) WHERE reverses_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_audit_log (
    id BIGSERIAL PRIMARY KEY,
    payment_id INT NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    action VARCHAR(30) NOT NULL CHECK (action IN ('recorded', 'reversed', 'imported')),
    actor_user_id INT REFERENCES app_users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payment_audit_log_payment_action_key UNIQUE (payment_id, action)
);

CREATE INDEX IF NOT EXISTS idx_payment_audit_log_payment_created
    ON payment_audit_log(payment_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS payment_audit_log_payment_action_key
    ON payment_audit_log(payment_id, action);

-- Reject invalid settings instead of silently inventing a historical payroll
-- basis. Missing settings use the same defaults as a fresh installation.
DO $$
DECLARE
    exclude_sundays_value TEXT;
    off_days_value TEXT;
BEGIN
    SELECT value INTO exclude_sundays_value
    FROM app_settings WHERE key = 'salary_exclude_sundays';
    SELECT value INTO off_days_value
    FROM app_settings WHERE key = 'salary_off_days';

    exclude_sundays_value := COALESCE(exclude_sundays_value, 'false');
    off_days_value := COALESCE(off_days_value, '0');

    IF exclude_sundays_value NOT IN ('true', 'false') THEN
        RAISE EXCEPTION 'Cannot backfill payroll: salary_exclude_sundays must be true or false';
    END IF;
    IF off_days_value !~ '^[0-9]+$' OR off_days_value::numeric > 30 THEN
        RAISE EXCEPTION 'Cannot backfill payroll: salary_off_days must be an integer from 0 to 30';
    END IF;
END $$;

WITH settings AS (
    SELECT
        COALESCE(
            MAX(value) FILTER (WHERE key = 'salary_exclude_sundays'),
            'false'
        )::boolean AS exclude_sundays,
        COALESCE(
            MAX(value) FILTER (WHERE key = 'salary_off_days'),
            '0'
        )::int AS off_days
    FROM app_settings
    WHERE key IN ('salary_exclude_sundays', 'salary_off_days')
), employee_periods AS (
    -- Preferably freeze every completed month, not only periods that were paid.
    SELECT e.id AS employee_id, periods.period_start::date
    FROM employees e
    CROSS JOIN LATERAL generate_series(
        GREATEST(date_trunc('month', e.joining_date)::date, DATE '2000-01-01')::timestamp,
        (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::timestamp,
        INTERVAL '1 month'
    ) AS periods(period_start)

    UNION

    -- Existing current/future payment periods must also receive a basis so every
    -- imported ledger entry is tied to an immutable snapshot.
    SELECT DISTINCT p.employee_id, make_date(p.payment_year, p.payment_month, 1)
    FROM payments p
), period_basis AS (
    SELECT ep.employee_id, ep.period_start,
           EXTRACT(YEAR FROM ep.period_start)::int AS payment_year,
           EXTRACT(MONTH FROM ep.period_start)::int AS payment_month,
           s.exclude_sundays, s.off_days,
           GREATEST(
               EXTRACT(DAY FROM (ep.period_start + INTERVAL '1 month - 1 day'))::int
               - CASE WHEN s.exclude_sundays THEN (
                   SELECT COUNT(*)::int
                   FROM generate_series(
                       ep.period_start::timestamp,
                       (ep.period_start + INTERVAL '1 month - 1 day')::timestamp,
                       INTERVAL '1 day'
                   ) AS calendar(day)
                   WHERE EXTRACT(ISODOW FROM calendar.day) = 7
                 ) ELSE 0 END
               - s.off_days,
               1
           ) AS payable_days
    FROM employee_periods ep
    CROSS JOIN settings s
), calculated AS (
    SELECT pb.*, e.designation_id, d.designation_name,
           e.salary AS employee_salary,
           d.default_salary AS designation_salary,
           COALESCE(e.salary, d.default_salary) AS effective_salary,
           COALESCE(att.worked_days, 0)::numeric(7,2) AS worked_days
    FROM period_basis pb
    JOIN employees e ON e.id = pb.employee_id
    LEFT JOIN designations d ON d.id = e.designation_id
    LEFT JOIN LATERAL (
        SELECT SUM(
            CASE WHEN a.status = 'Present' THEN 1::numeric
                 WHEN a.status = 'Half Day' THEN 0.5::numeric
                 ELSE 0::numeric END
        ) AS worked_days
        FROM attendance a
        WHERE a.employee_id = pb.employee_id
          AND a.attendance_date >= pb.period_start
          AND a.attendance_date < pb.period_start + INTERVAL '1 month'
    ) att ON TRUE
)
INSERT INTO payroll_snapshots (
    employee_id, payment_month, payment_year,
    designation_id, designation_name, employee_salary, designation_salary, effective_salary,
    salary_exclude_sundays, salary_off_days, payable_days, worked_days, due_amount,
    finalization_reason
)
SELECT c.employee_id, c.payment_month, c.payment_year,
       c.designation_id, c.designation_name, c.employee_salary, c.designation_salary,
       c.effective_salary, c.exclude_sundays, c.off_days, c.payable_days, c.worked_days,
       CASE WHEN c.effective_salary IS NULL THEN 0
            ELSE LEAST(
                c.effective_salary::numeric,
                ROUND(c.effective_salary::numeric * c.worked_days / c.payable_days::numeric, 2)
            )
       END,
       'migration'
FROM calculated c
WHERE c.payment_year BETWEEN 2000 AND 2100
ON CONFLICT (employee_id, payment_year, payment_month) DO NOTHING;

-- Existing rows predate the append-only ledger and receive an explicit import
-- event. New rows are audited by the insert trigger below.
INSERT INTO payment_audit_log (payment_id, action, actor_user_id, metadata, created_at)
SELECT p.id, 'imported', p.created_by,
       jsonb_build_object('source', 'pre_ledger_migration'),
       COALESCE(p.created_at, CURRENT_TIMESTAMP)
FROM payments p
ON CONFLICT (payment_id, action) DO NOTHING;

CREATE OR REPLACE FUNCTION validate_payment_ledger_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    original payments%ROWTYPE;
BEGIN
    IF NEW.entry_type = 'payment' THEN
        IF make_date(NEW.payment_year, NEW.payment_month, 1)
               < date_trunc('month', CURRENT_DATE)::date
           AND NOT EXISTS (
               SELECT 1 FROM payroll_snapshots ps
               WHERE ps.employee_id = NEW.employee_id
                 AND ps.payment_year = NEW.payment_year
                 AND ps.payment_month = NEW.payment_month
           ) THEN
            RAISE EXCEPTION 'Historical payments require a finalized payroll snapshot';
        END IF;
        RETURN NEW;
    END IF;

    SELECT * INTO original
    FROM payments
    WHERE id = NEW.reverses_payment_id
    FOR KEY SHARE;

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

-- This trigger deliberately remains separate from the ledger/approval trigger.
-- Migration 0005 replaces the latter, while these temporal and actor invariants
-- must stay active throughout a rolling deployment with older API instances.
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

DROP TRIGGER IF EXISTS payment_audit_log_reject_mutation ON payment_audit_log;
CREATE TRIGGER payment_audit_log_reject_mutation
BEFORE UPDATE OR DELETE ON payment_audit_log
FOR EACH ROW EXECUTE FUNCTION reject_immutable_financial_change();
