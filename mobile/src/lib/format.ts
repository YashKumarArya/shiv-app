const localDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
};

const currencyFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export const today = () => localDateString(new Date());

export const addDays = (date: string, days: number) => {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() + days);
  return localDateString(d);
};

export const formatDate = (date?: string | null) =>
  date
    ? parseLocalDate(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

export const monthName = (month: number) =>
  new Date(2000, month - 1).toLocaleString('en', { month: 'long' });

/** Formats API numeric values consistently and never renders an invalid `NaN` amount. */
export const formatCurrency = (value?: string | number | null) => {
  const amount = Number(value ?? 0);
  return `₹${currencyFormatter.format(Number.isFinite(amount) ? amount : 0)}`;
};
