export const today = () => new Date().toISOString().slice(0, 10);

export const addDays = (date: string, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const formatDate = (date?: string | null) =>
  date
    ? new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

export const monthName = (month: number) =>
  new Date(2000, month - 1).toLocaleString('en', { month: 'long' });
