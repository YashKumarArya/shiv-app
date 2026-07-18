-- Bring databases created from the original root schema up to the API schema.

ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'staff';
ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE designations
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS blood_group VARCHAR(5);
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE locations
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE employee_assignments
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE attendance
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE employee_documents
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE uniform_issues
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- The original standalone schema did not create the employee-code sequence.
-- Never move an existing sequence backwards (deleted employee rows may have used
-- larger values), but advance a newly-created one past imported EMP codes.
WITH max_code AS (
    SELECT MAX(SUBSTRING(employee_code FROM 4)::bigint) AS value
    FROM employees
    WHERE employee_code ~ '^EMP[0-9]{1,18}$'
), sequence_state AS (
    SELECT last_value, is_called FROM employee_code_seq
)
SELECT setval(
    'employee_code_seq',
    GREATEST(sequence_state.last_value, COALESCE(max_code.value, 1)),
    sequence_state.is_called OR max_code.value IS NOT NULL
)
FROM max_code, sequence_state;

-- Salary payments are an installment ledger, not one row per employee/month.
ALTER TABLE payments
    DROP CONSTRAINT IF EXISTS payments_employee_id_payment_month_payment_year_key;

-- Preserve the effective rule used by every deployed settings model before
-- removing salary_off_mode. The short-lived `fixed` model stored its count in
-- salary_off_days; the earlier model stored 3/4 directly in the mode.
DO $$
DECLARE
    legacy_mode_raw TEXT;
    legacy_mode TEXT;
    legacy_days_raw TEXT;
    mapped_exclude_sundays TEXT;
    mapped_off_days TEXT;
BEGIN
    SELECT value INTO legacy_mode_raw
    FROM app_settings
    WHERE key = 'salary_off_mode';

    IF legacy_mode_raw IS NOT NULL THEN
        legacy_mode := LOWER(BTRIM(legacy_mode_raw));
        IF legacy_mode NOT IN ('none', 'sundays', '3', '4', 'fixed') THEN
            RAISE EXCEPTION 'Cannot migrate salary_off_mode: unsupported value "%"', legacy_mode_raw;
        END IF;

        IF legacy_mode = 'fixed' THEN
            SELECT value INTO legacy_days_raw
            FROM app_settings
            WHERE key = 'salary_off_days';
            IF legacy_days_raw IS NULL
               OR BTRIM(legacy_days_raw) !~ '^[0-9]+$'
               OR BTRIM(legacy_days_raw)::numeric NOT BETWEEN 1 AND 30 THEN
                RAISE EXCEPTION 'Cannot migrate fixed salary_off_mode: salary_off_days must be an integer from 1 to 30';
            END IF;
        END IF;

        mapped_exclude_sundays := CASE WHEN legacy_mode = 'sundays' THEN 'true' ELSE 'false' END;
        mapped_off_days := CASE
            WHEN legacy_mode IN ('3', '4') THEN legacy_mode
            WHEN legacy_mode = 'fixed' THEN BTRIM(legacy_days_raw)
            ELSE '0'
        END;

        INSERT INTO app_settings (key, value) VALUES
            ('salary_exclude_sundays', mapped_exclude_sundays),
            ('salary_off_days', mapped_off_days)
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;

        DELETE FROM app_settings WHERE key = 'salary_off_mode';
    END IF;
END $$;

INSERT INTO app_settings (key, value) VALUES
    ('salary_exclude_sundays', 'false'),
    ('salary_off_days', '0'),
    ('company_name', ''),
    ('company_address', ''),
    ('company_phone', ''),
    ('company_logo', ''),
    ('company_signature', '')
ON CONFLICT (key) DO NOTHING;
