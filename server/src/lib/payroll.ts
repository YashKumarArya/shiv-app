import { query, queryOne, type DbExecutor } from '../config/db.js';
import { HttpError } from './http.js';

export interface SalarySettings {
  excludeSundays: boolean;
  /** Additional non-working days per month, on top of Sundays if excluded. */
  extraDays: number;
}

const poolExecutor: DbExecutor = { query, queryOne };

/**
 * Serializes payroll-setting changes with snapshot creation even if a partially
 * initialized database is missing one of the setting rows (which row locks
 * cannot protect). The transaction owns the lock until commit or rollback.
 */
export const lockPayrollSettingsBasis = async (executor: DbExecutor) => {
  await executor.query(
    `SELECT pg_advisory_xact_lock(hashtextextended('payroll-settings-basis', 0))`,
  );
};

export const getSalarySettings = async (executor: DbExecutor = poolExecutor): Promise<SalarySettings> => {
  const rows = await executor.query<{ key: string; value: string }>(
    `SELECT key, value FROM app_settings WHERE key IN ('salary_exclude_sundays', 'salary_off_days')`,
  );
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const excludeValue = map.salary_exclude_sundays;
  if (excludeValue !== 'true' && excludeValue !== 'false') {
    throw new Error('Invalid salary_exclude_sundays payroll setting: expected true or false');
  }
  const offDaysValue = map.salary_off_days;
  if (!/^(0|[1-9]\d*)$/.test(offDaysValue ?? '')) {
    throw new Error('Invalid salary_off_days payroll setting: expected an integer from 0 to 30');
  }
  const extraDays = Number(offDaysValue);
  if (extraDays > 30) {
    throw new Error('Invalid salary_off_days payroll setting: expected an integer from 0 to 30');
  }
  const excludeSundays = excludeValue === 'true';
  return { excludeSundays, extraDays };
};

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const sundaysInMonth = (year: number, month: number) => {
  let count = 0;
  for (let day = 1; day <= daysInMonth(year, month); day += 1) {
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0) count += 1;
  }
  return count;
};

/** Days an employee is expected to work in a month, combining both settings additively:
 *  total days − Sundays (if excluded) − extra days. Per-day pay = salary / payableDays. */
export const payableDays = (year: number, month: number, { excludeSundays, extraDays }: SalarySettings) => {
  const total = daysInMonth(year, month);
  const sundays = excludeSundays ? sundaysInMonth(year, month) : 0;
  return Math.max(total - sundays - extraDays, 1);
};

export type PayrollFinalizationReason = 'period_closed' | 'payment_recorded' | 'manual' | 'migration';

interface FinalizePayrollOptions {
  month: number;
  year: number;
  employeeId?: number;
  designationId?: number;
  finalizedBy?: number;
  reason: PayrollFinalizationReason;
}

export type PayrollPeriodState = 'past' | 'current' | 'future';

/** Uses the database clock so payroll cut-offs do not depend on an API host timezone. */
export const payrollPeriodState = async (
  year: number,
  month: number,
  executor: DbExecutor = poolExecutor,
): Promise<PayrollPeriodState> => {
  const row = await executor.queryOne<{ state: PayrollPeriodState }>(
    `SELECT CASE
       WHEN make_date($1, $2, 1) < date_trunc('month', CURRENT_DATE)::date THEN 'past'
       WHEN make_date($1, $2, 1) = date_trunc('month', CURRENT_DATE)::date THEN 'current'
       ELSE 'future'
     END AS state`,
    [year, month],
  );
  return row!.state;
};

/**
 * Appends immutable payroll bases. Existing snapshots win, making repeated calls
 * idempotent and ensuring later salary/designation/settings edits cannot rewrite a
 * finalized period.
 */
export const finalizePayrollSnapshots = async (
  executor: DbExecutor,
  options: FinalizePayrollOptions,
) => {
  const {
    month, year, employeeId, designationId, finalizedBy, reason,
  } = options;
  if (await payrollPeriodState(year, month, executor) === 'future') {
    throw new HttpError(409, 'A future payroll period cannot be finalized');
  }

  // Global lock order for payroll-basis mutations is settings -> designations
  // -> employees. Settings/designation PUT handlers use the same leading locks.
  await lockPayrollSettingsBasis(executor);
  await executor.query(
    `SELECT d.id
     FROM designations d
     WHERE EXISTS (
       SELECT 1 FROM employees e
       WHERE e.designation_id = d.id
         AND ($1::int IS NULL OR e.id = $1)
         AND ($2::int IS NULL OR e.designation_id = $2)
     )
     ORDER BY d.id
     FOR SHARE`,
    [employeeId ?? null, designationId ?? null],
  );

  // Serialize finalization with attendance and compensation mutations. An
  // attendance writer that starts first commits before this snapshot; one that
  // starts later sees the snapshot and is rejected.
  await executor.query(
    `SELECT id FROM employees
     WHERE ($1::int IS NULL OR id = $1)
       AND ($2::int IS NULL OR designation_id = $2)
     ORDER BY id
     FOR UPDATE`,
    [employeeId ?? null, designationId ?? null],
  );

  const settings = await getSalarySettings(executor);
  const payable = payableDays(year, month, settings);
  return executor.query<{ employee_id: number }>(
    `INSERT INTO payroll_snapshots (
       employee_id, payment_month, payment_year,
       designation_id, designation_name, employee_salary, designation_salary, effective_salary,
       salary_exclude_sundays, salary_off_days, payable_days, worked_days, due_amount,
       finalization_reason, finalized_by
     )
     SELECT e.id, $1, $2,
            d.id, d.designation_name, e.salary, d.default_salary,
            COALESCE(e.salary, d.default_salary),
            $5, $6, $7, att.worked_days,
            CASE WHEN COALESCE(e.salary, d.default_salary) IS NULL THEN 0
                 ELSE LEAST(
                   COALESCE(e.salary, d.default_salary)::numeric,
                   ROUND(COALESCE(e.salary, d.default_salary)::numeric * att.worked_days / $7::numeric, 2)
                 )
            END,
            $8, $9
     FROM employees e
     JOIN designations d ON d.id = e.designation_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(
         CASE WHEN a.status = 'Present' THEN 1::numeric
              WHEN a.status = 'Half Day' THEN 0.5::numeric
              ELSE 0::numeric END
       ), 0)::numeric AS worked_days
       FROM attendance a
       WHERE a.employee_id = e.id
         AND a.attendance_date >= make_date($2, $1, 1)
         AND a.attendance_date < make_date($2, $1, 1) + INTERVAL '1 month'
     ) att ON TRUE
     WHERE e.joining_date < make_date($2, $1, 1) + INTERVAL '1 month'
       AND ($3::int IS NULL OR e.id = $3)
       AND ($4::int IS NULL OR e.designation_id = $4)
       AND (
         e.status = 'Active'
         OR att.worked_days > 0
         OR EXISTS (
           SELECT 1 FROM payments p
           WHERE p.employee_id = e.id AND p.payment_month = $1 AND p.payment_year = $2
         )
         OR $3::int IS NOT NULL
       )
     ON CONFLICT (employee_id, payment_year, payment_month) DO NOTHING
     RETURNING employee_id`,
    [
      month,
      year,
      employeeId ?? null,
      designationId ?? null,
      settings.excludeSundays,
      settings.extraDays,
      payable,
      reason,
      finalizedBy ?? null,
    ],
  );
};

interface CompletedPayrollScope {
  employeeId?: number;
  designationId?: number;
}

/**
 * Compensation and payroll-setting edits must not silently freeze old periods.
 * The administrator explicitly finalizes any relevant completed period first.
 */
export const assertCompletedPayrollFinalized = async (
  executor: DbExecutor,
  scope: CompletedPayrollScope = {},
) => {
  const missing = await executor.queryOne<{ employee_code: string; month: number; year: number }>(
    `SELECT e.employee_code,
            EXTRACT(MONTH FROM period)::int AS month,
            EXTRACT(YEAR FROM period)::int AS year
     FROM employees e
     CROSS JOIN LATERAL generate_series(
       date_trunc('month', e.joining_date),
       date_trunc('month', CURRENT_DATE) - INTERVAL '1 month',
       INTERVAL '1 month'
     ) AS period
     WHERE ($1::int IS NULL OR e.id = $1)
       AND ($2::int IS NULL OR e.designation_id = $2)
       AND (
         e.status = 'Active'
         OR EXISTS (
           SELECT 1 FROM attendance a
           WHERE a.employee_id = e.id
             AND a.attendance_date >= period
             AND a.attendance_date < period + INTERVAL '1 month'
         )
         OR EXISTS (
           SELECT 1 FROM payments p
           WHERE p.employee_id = e.id
             AND p.payment_year = EXTRACT(YEAR FROM period)::int
             AND p.payment_month = EXTRACT(MONTH FROM period)::int
         )
       )
       AND NOT EXISTS (
         SELECT 1 FROM payroll_snapshots ps
         WHERE ps.employee_id = e.id
           AND ps.payment_year = EXTRACT(YEAR FROM period)::int
           AND ps.payment_month = EXTRACT(MONTH FROM period)::int
       )
     ORDER BY period, e.id
     LIMIT 1`,
    [scope.employeeId ?? null, scope.designationId ?? null],
  );
  if (missing) {
    throw new HttpError(
      409,
      `Finalize ${missing.year}-${String(missing.month).padStart(2, '0')} payroll before changing historical payroll inputs (${missing.employee_code})`,
    );
  }
};
