-- Field staff logins. Until now app_users held only office roles and employees
-- had no way to sign in at all. Guards and supervisors now get an account that
-- is permanently bound to one employee row, which is what every self-scoped
-- query keys off: a guard's "my salary" is app_users.employee_id, never a
-- client-supplied id.
--
-- Accounts are not backfilled. Creating logins for existing employees would
-- mean minting credentials nobody chose; an admin enables access per employee.

ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS employee_id INT;

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

-- One login per employee. A second account for the same guard would split their
-- patrol and attendance history in two.
CREATE UNIQUE INDEX IF NOT EXISTS app_users_employee_unique
    ON app_users(employee_id)
    WHERE employee_id IS NOT NULL;

-- Guards identify by phone; most have no email address. Office accounts keep
-- using email, so exactly one of the two identifiers must be present.
ALTER TABLE app_users
    ALTER COLUMN email DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_phone_unique
    ON app_users(phone)
    WHERE phone IS NOT NULL;

DO $$
BEGIN
    -- 0003 pinned this to admin/staff. Widen it in one step so no window exists
    -- where a field role could be written without a constraint.
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'app_users_role_check' AND conrelid = 'app_users'::regclass
    ) THEN
        ALTER TABLE app_users DROP CONSTRAINT app_users_role_check;
    END IF;

    ALTER TABLE app_users
        ADD CONSTRAINT app_users_role_check
        CHECK (role IN ('admin', 'staff', 'supervisor', 'guard'));

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'app_users_field_role_employee_check' AND conrelid = 'app_users'::regclass
    ) THEN
        -- The binding is the authorization boundary, so the database enforces
        -- it rather than trusting every call site to set employee_id.
        ALTER TABLE app_users
            ADD CONSTRAINT app_users_field_role_employee_check
            CHECK ((role IN ('guard', 'supervisor')) = (employee_id IS NOT NULL));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'app_users_identifier_check' AND conrelid = 'app_users'::regclass
    ) THEN
        ALTER TABLE app_users
            ADD CONSTRAINT app_users_identifier_check
            CHECK (email IS NOT NULL OR phone IS NOT NULL);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
