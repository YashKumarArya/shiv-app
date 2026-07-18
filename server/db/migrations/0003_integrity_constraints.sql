-- Reject ambiguous existing data with a useful error before adding constraints.
-- We do not silently rewrite financial or historical records.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM app_users WHERE role NOT IN ('admin', 'staff')) THEN
        RAISE EXCEPTION 'Cannot constrain app_users.role: values outside admin/staff exist';
    END IF;
    IF EXISTS (SELECT 1 FROM designations WHERE default_salary < 0) THEN
        RAISE EXCEPTION 'Cannot constrain designations.default_salary: negative values exist';
    END IF;
    IF EXISTS (SELECT 1 FROM employees WHERE salary < 0) THEN
        RAISE EXCEPTION 'Cannot constrain employees.salary: negative values exist';
    END IF;
    IF EXISTS (SELECT 1 FROM employees WHERE status NOT IN ('Active', 'Inactive')) THEN
        RAISE EXCEPTION 'Cannot constrain employees.status: unsupported values exist';
    END IF;
    IF EXISTS (SELECT 1 FROM employee_assignments WHERE status NOT IN ('Active', 'Ended')) THEN
        RAISE EXCEPTION 'Cannot constrain employee_assignments.status: unsupported values exist';
    END IF;
    IF EXISTS (
        SELECT 1 FROM employee_assignments
        WHERE end_date < start_date
           OR (status = 'Active' AND end_date IS NOT NULL)
           OR (status = 'Ended' AND end_date IS NULL)
           OR (status IS NULL AND end_date IS NOT NULL)
    ) THEN
        RAISE EXCEPTION 'Cannot constrain employee_assignments: status and date history is inconsistent';
    END IF;
    IF EXISTS (SELECT 1 FROM attendance WHERE status NOT IN ('Present', 'Absent', 'Half Day', 'Leave')) THEN
        RAISE EXCEPTION 'Cannot constrain attendance.status: unsupported values exist';
    END IF;
    IF EXISTS (
        SELECT 1 FROM payments
        WHERE payment_month NOT BETWEEN 1 AND 12
           OR payment_year NOT BETWEEN 2000 AND 2100
           OR amount <= 0
    ) THEN
        RAISE EXCEPTION 'Cannot constrain payments: invalid month, year, or amount exists';
    END IF;
    IF EXISTS (
        SELECT 1 FROM uniform_issues
        WHERE returned_date < issued_date
           OR (returned = FALSE AND returned_date IS NOT NULL)
           OR (returned = TRUE AND returned_date IS NULL)
           OR (returned IS NULL AND returned_date IS NOT NULL)
    ) THEN
        RAISE EXCEPTION 'Cannot constrain uniform_issues: returned state and dates are inconsistent';
    END IF;
    IF EXISTS (
        SELECT 1 FROM app_users GROUP BY LOWER(email) HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot create case-insensitive app user email index: duplicate emails exist';
    END IF;
    IF EXISTS (
        SELECT 1 FROM employee_assignments
        WHERE status = 'Active' GROUP BY employee_id HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot enforce one active assignment: duplicate active assignments exist';
    END IF;
    IF EXISTS (
        SELECT 1 FROM uniform_issues
        WHERE returned = FALSE GROUP BY employee_id HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot enforce one outstanding uniform: duplicate issues exist';
    END IF;
    IF EXISTS (
        SELECT 1 FROM attendance GROUP BY employee_id, attendance_date HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot enforce unique daily attendance: duplicate rows exist';
    END IF;
END $$;

-- Nullable booleans/statuses in the legacy schema represented their defaults.
UPDATE app_users SET role = 'staff' WHERE role IS NULL;
UPDATE app_users SET status = TRUE WHERE status IS NULL;
UPDATE designations SET uniform_required = TRUE WHERE uniform_required IS NULL;
UPDATE designations SET is_active = TRUE WHERE is_active IS NULL;
UPDATE employees SET status = 'Active' WHERE status IS NULL;
UPDATE locations SET status = TRUE WHERE status IS NULL;
UPDATE employee_assignments SET status = 'Active' WHERE status IS NULL;
UPDATE uniform_issues SET returned = FALSE WHERE returned IS NULL;

ALTER TABLE app_users
    ALTER COLUMN role SET DEFAULT 'staff',
    ALTER COLUMN role SET NOT NULL,
    ALTER COLUMN status SET DEFAULT TRUE,
    ALTER COLUMN status SET NOT NULL;
ALTER TABLE designations
    ALTER COLUMN uniform_required SET DEFAULT TRUE,
    ALTER COLUMN uniform_required SET NOT NULL,
    ALTER COLUMN is_active SET DEFAULT TRUE,
    ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE employees
    ALTER COLUMN status SET DEFAULT 'Active',
    ALTER COLUMN status SET NOT NULL;
ALTER TABLE locations
    ALTER COLUMN status SET DEFAULT TRUE,
    ALTER COLUMN status SET NOT NULL;
ALTER TABLE employee_assignments
    ALTER COLUMN status SET DEFAULT 'Active',
    ALTER COLUMN status SET NOT NULL;
ALTER TABLE uniform_issues
    ALTER COLUMN returned SET DEFAULT FALSE,
    ALTER COLUMN returned SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_users_role_check' AND conrelid = 'app_users'::regclass) THEN
        ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('admin', 'staff'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'designations_default_salary_check' AND conrelid = 'designations'::regclass) THEN
        ALTER TABLE designations ADD CONSTRAINT designations_default_salary_check CHECK (default_salary >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_salary_check' AND conrelid = 'employees'::regclass) THEN
        ALTER TABLE employees ADD CONSTRAINT employees_salary_check CHECK (salary >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_status_check' AND conrelid = 'employees'::regclass) THEN
        ALTER TABLE employees ADD CONSTRAINT employees_status_check CHECK (status IN ('Active', 'Inactive'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_assignments_status_check' AND conrelid = 'employee_assignments'::regclass) THEN
        ALTER TABLE employee_assignments ADD CONSTRAINT employee_assignments_status_check CHECK (status IN ('Active', 'Ended'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_assignments_dates_check' AND conrelid = 'employee_assignments'::regclass) THEN
        ALTER TABLE employee_assignments ADD CONSTRAINT employee_assignments_dates_check CHECK (end_date IS NULL OR end_date >= start_date);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_assignments_state_check' AND conrelid = 'employee_assignments'::regclass) THEN
        ALTER TABLE employee_assignments ADD CONSTRAINT employee_assignments_state_check CHECK ((status = 'Active' AND end_date IS NULL) OR (status = 'Ended' AND end_date IS NOT NULL));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_status_check' AND conrelid = 'attendance'::regclass) THEN
        ALTER TABLE attendance ADD CONSTRAINT attendance_status_check CHECK (status IN ('Present', 'Absent', 'Half Day', 'Leave'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_payment_month_check' AND conrelid = 'payments'::regclass) THEN
        ALTER TABLE payments ADD CONSTRAINT payments_payment_month_check CHECK (payment_month BETWEEN 1 AND 12);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_payment_year_check' AND conrelid = 'payments'::regclass) THEN
        ALTER TABLE payments ADD CONSTRAINT payments_payment_year_check CHECK (payment_year BETWEEN 2000 AND 2100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_check' AND conrelid = 'payments'::regclass) THEN
        ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK (amount > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uniform_issues_dates_check' AND conrelid = 'uniform_issues'::regclass) THEN
        ALTER TABLE uniform_issues ADD CONSTRAINT uniform_issues_dates_check CHECK (returned_date IS NULL OR returned_date >= issued_date);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uniform_issues_state_check' AND conrelid = 'uniform_issues'::regclass) THEN
        ALTER TABLE uniform_issues ADD CONSTRAINT uniform_issues_state_check CHECK ((returned = FALSE AND returned_date IS NULL) OR (returned = TRUE AND returned_date IS NOT NULL));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_employee_id_attendance_date_key
    ON attendance(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_payments_employee_period
    ON payments(employee_id, payment_year, payment_month);
CREATE INDEX IF NOT EXISTS idx_employees_designation ON employees(designation_id);
CREATE INDEX IF NOT EXISTS idx_assignments_location ON employee_assignments(location_id);
CREATE INDEX IF NOT EXISTS idx_attendance_location ON attendance(location_id);
CREATE INDEX IF NOT EXISTS idx_uniforms_employee ON uniform_issues(employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email_ci ON app_users(LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_one_active_per_employee
    ON employee_assignments(employee_id) WHERE status = 'Active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_uniforms_one_outstanding_per_employee
    ON uniform_issues(employee_id) WHERE returned = FALSE;

-- The period index has employee_id as its leading column, making this redundant.
DROP INDEX IF EXISTS idx_payments_employee;
