-- Existing payroll and operational history must stay attached to an employment
-- date that could have produced it. Reversals remain reversible even if an
-- earlier application version allowed an inconsistent joining-date edit.

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

DROP TRIGGER IF EXISTS employees_validate_joining_date_change ON employees;
CREATE TRIGGER employees_validate_joining_date_change
BEFORE UPDATE OF joining_date ON employees
FOR EACH ROW
WHEN (NEW.joining_date IS DISTINCT FROM OLD.joining_date)
EXECUTE FUNCTION validate_employee_joining_date_change();
