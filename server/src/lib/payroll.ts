import { queryOne } from '../config/db.js';

export const SALARY_OFF_MODES = ['none', 'sundays', '3', '4'] as const;
export type SalaryOffMode = (typeof SALARY_OFF_MODES)[number];

export const getSalaryOffMode = async (): Promise<SalaryOffMode> => {
  const row = await queryOne<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'salary_off_mode'`,
  );
  return SALARY_OFF_MODES.includes(row?.value as SalaryOffMode) ? (row!.value as SalaryOffMode) : 'none';
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
export const payableDays = (year: number, month: number, mode: SalaryOffMode) => {
  const days = daysInMonth(year, month);
  if (mode === 'sundays') return days - sundaysInMonth(year, month);
  if (mode === '4') return days - 4;
  if (mode === '3') return days - 3;
  return days;
};
