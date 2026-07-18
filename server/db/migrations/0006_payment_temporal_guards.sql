-- Keep actor and date invariants in a trigger that is independent from payroll
-- approval rules. It also installs the final guard after an operator has safely
-- reconciled any reviewed pre-production draft; checksum mismatches are never
-- accepted or rewritten automatically by the migration runner.

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

DROP TRIGGER IF EXISTS payments_validate_temporal_insert ON payments;
CREATE TRIGGER payments_validate_temporal_insert
BEFORE INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION validate_payment_temporal_entry();
