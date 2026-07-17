import { query } from '../config/db.js';

export const SALARY_OFF_MODES = ['none', 'sundays', 'fixed'] as const;
export type SalaryOffMode = (typeof SALARY_OFF_MODES)[number];

export interface SalarySettings {
  mode: SalaryOffMode;
  /** Days off per month when mode is 'fixed'; ignored otherwise. */
  days: number;
}

export const getSalarySettings = async (): Promise<SalarySettings> => {
  const rows = await query<{ key: string; value: string }>(
    `SELECT key, value FROM app_settings WHERE key IN ('salary_off_mode', 'salary_off_days')`,
  );
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const mode = SALARY_OFF_MODES.includes(map.salary_off_mode as SalaryOffMode)
    ? (map.salary_off_mode as SalaryOffMode)
    : 'none';
  const parsedDays = Number(map.salary_off_days);
  const days = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.floor(parsedDays) : 0;
  return { mode, days };
};

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const sundaysInMonth = (year: number, month: number) => {
  let count = 0;
  for (let day = 1; day <= daysInMonth(year, month); day += 1) {
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0) count += 1;
  }
  return count;
};

/** Days an employee is expected to work in a month under the salary off-days setting.
 *  Per-day pay = monthly salary / payableDays; earned = per-day pay × worked days. */
export const payableDays = (year: number, month: number, { mode, days }: SalarySettings) => {
  const total = daysInMonth(year, month);
  if (mode === 'sundays') return total - sundaysInMonth(year, month);
  if (mode === 'fixed') return Math.max(total - days, 1);
  return total;
};
