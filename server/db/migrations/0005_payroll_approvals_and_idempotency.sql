-- Add retry-safe payment creation and distinguish a computed snapshot from an
-- explicitly approved payroll period. Also prune legacy-estimate snapshot rows
-- for inactive employees after their last evidence-bearing periods.

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'payments_idempotency_key_check' AND conrelid = 'payments'::regclass
    ) THEN
        ALTER TABLE payments ADD CONSTRAINT payments_idempotency_key_check
            CHECK (
                idempotency_key IS NULL
                OR (NULLIF(BTRIM(idempotency_key), '') IS NOT NULL AND created_by IS NOT NULL)
            );
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency_key
    ON payments(created_by, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND entry_type = 'payment';

-- The composite identity lets approval rows prove that their duplicated lookup
-- fields refer to the same snapshot, rather than merely to some employee/period.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'payroll_snapshots_approval_identity_key'
          AND conrelid = 'payroll_snapshots'::regclass
    ) THEN
        ALTER TABLE payroll_snapshots
            ADD CONSTRAINT payroll_snapshots_approval_identity_key
            UNIQUE (id, employee_id, payment_year, payment_month);
    END IF;
END $$;

-- Migration 0004 deliberately erred on the side of preserving history, but a
-- current Inactive flag has no termination date. Keep its estimated snapshots
-- only where legacy data proves activity: attendance, a payment, or an ended
-- assignment overlapping that month. An open-ended "Active" assignment on an
-- Inactive employee is contradictory stale data, not reliable employment
-- evidence, so only assignments with an actual end date are used. Active
-- employees retain the full history. Current/future migration snapshots are
-- always removed: current payroll remains live until manual approval, even when
-- an imported installment already exists. The connection's CURRENT_DATE uses
-- BUSINESS_TIME_ZONE.
DROP TRIGGER IF EXISTS payroll_snapshots_reject_mutation ON payroll_snapshots;

DELETE FROM payroll_snapshots ps
USING employees e
WHERE ps.employee_id = e.id
  AND ps.finalization_reason = 'migration'
  AND (
      (
          make_date(ps.payment_year, ps.payment_month, 1)
              >= date_trunc('month', CURRENT_DATE)::date
      )
      OR
      (
          e.status = 'Inactive'
          AND NOT EXISTS (
              SELECT 1 FROM attendance a
              WHERE a.employee_id = ps.employee_id
                AND a.attendance_date >= make_date(ps.payment_year, ps.payment_month, 1)
                AND a.attendance_date < make_date(ps.payment_year, ps.payment_month, 1) + INTERVAL '1 month'
          )
          AND NOT EXISTS (
              SELECT 1 FROM payments p
              WHERE p.employee_id = ps.employee_id
                AND p.payment_year = ps.payment_year
                AND p.payment_month = ps.payment_month
          )
          AND NOT EXISTS (
              SELECT 1 FROM employee_assignments ea
              WHERE ea.employee_id = ps.employee_id
                AND ea.end_date IS NOT NULL
                AND ea.start_date < make_date(ps.payment_year, ps.payment_month, 1) + INTERVAL '1 month'
                AND ea.end_date >= make_date(ps.payment_year, ps.payment_month, 1)
          )
      )
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

CREATE INDEX IF NOT EXISTS idx_payroll_period_approvals_period
    ON payroll_period_approvals(payment_year, payment_month);

-- Legacy estimates form the approved migration baseline but remain visibly
-- marked by source/reason. Only manual snapshots attributed to an admin are safe
-- to infer as explicit historical approvals.
INSERT INTO payroll_period_approvals (
    payroll_snapshot_id, employee_id, payment_month, payment_year,
    approval_source, approved_by, approved_at
)
SELECT ps.id, ps.employee_id, ps.payment_month, ps.payment_year,
       CASE WHEN ps.finalization_reason = 'migration' THEN 'migration' ELSE 'manual' END,
       CASE WHEN ps.finalization_reason = 'manual' THEN ps.finalized_by ELSE NULL END,
       ps.finalized_at
FROM payroll_snapshots ps
LEFT JOIN app_users approver ON approver.id = ps.finalized_by
WHERE ps.finalization_reason = 'migration'
   OR (
       ps.finalization_reason = 'manual'
       AND ps.finalized_by IS NOT NULL
       AND approver.role = 'admin'
   )
ON CONFLICT (employee_id, payment_year, payment_month) DO NOTHING;

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

DROP TRIGGER IF EXISTS payroll_period_approvals_validate_insert ON payroll_period_approvals;
CREATE TRIGGER payroll_period_approvals_validate_insert
BEFORE INSERT ON payroll_period_approvals
FOR EACH ROW EXECUTE FUNCTION validate_payroll_period_approval();

-- Historical payments require explicit approval, not merely a lazily-computed
-- snapshot. Reversals remain tied exactly to their original immutable payment.
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

DROP TRIGGER IF EXISTS payments_validate_ledger_insert ON payments;
CREATE TRIGGER payments_validate_ledger_insert
BEFORE INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION validate_payment_ledger_entry();

CREATE TRIGGER payroll_snapshots_reject_mutation
BEFORE UPDATE OR DELETE ON payroll_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_immutable_financial_change();

DROP TRIGGER IF EXISTS payroll_period_approvals_reject_mutation ON payroll_period_approvals;
CREATE TRIGGER payroll_period_approvals_reject_mutation
BEFORE UPDATE OR DELETE ON payroll_period_approvals
FOR EACH ROW EXECUTE FUNCTION reject_immutable_financial_change();
