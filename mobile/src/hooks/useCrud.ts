import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';

export type ListParams = Record<string, string | number | boolean | undefined>;

export const useList = <T>(resource: string, params?: ListParams) =>
  useQuery<T[]>({
    queryKey: [resource, params],
    queryFn: async () => (await api.get(`/${resource}`, { params })).data,
  });

export const useItem = <T>(resource: string, id?: string | number) =>
  useQuery<T>({
    queryKey: [resource, String(id)],
    queryFn: async () => (await api.get(`/${resource}/${id}`)).data,
    enabled: !!id,
  });

/** Create when no id is passed to mutate, update when it is. */
export const useSave = (resource: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id?: string | number } & Record<string, unknown>) =>
      (id ? await api.put(`/${resource}/${id}`, body) : await api.post(`/${resource}`, body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [resource] }),
  });
};

export const useRemove = (resource: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/${resource}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [resource] }),
  });
};
