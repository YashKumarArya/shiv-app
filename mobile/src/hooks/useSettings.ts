import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';

/**
 * App settings (company branding, payroll config). Branding is edited from
 * other devices and its images use short-lived signed URLs, so this stays
 * fresher than the app-wide default.
 */
export const useSettings = (enabled = true) =>
  useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
    staleTime: 30_000,
    enabled,
  });
