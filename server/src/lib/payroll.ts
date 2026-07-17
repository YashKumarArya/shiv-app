import { query } from '../config/db.js';

export interface SalarySettings {
  excludeSundays: boolean;
  /** Additional non-working days per month, on top of Sundays if excluded. */
  extraDays: number;
}

export const getSalarySettings = async (): Promise<SalarySettings> => {
  const rows = await query<{ key: string; value: string }>(
    `SELECT key, value FROM app_settings WHERE key IN ('salary_exclude_sundays', 'salary_off_days')`,
  );
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const excludeSundays = map.salary_exclude_sundays === 'true';
  const parsedDays = Number(map.salary_off_days);
  const extraDays = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.floor(parsedDays) : 0;
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
