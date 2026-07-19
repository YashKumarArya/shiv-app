import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { invalidateResourceQueries } from '@/lib/queryInvalidation';

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

const isEntity = (value: unknown): value is { id: number | string } =>
  typeof value === 'object' && value !== null && 'id' in value;

/**
 * Optimistically rewrites every cached query under a resource before the server
 * responds, returning snapshots for rollback. Only plain entity shapes (arrays
 * of `{ id }` rows and single `{ id }` records) are touched; custom-shaped
 * caches (rosters, tracking summaries) are left as-is and simply refresh on the
 * follow-up invalidation.
 */
const applyOptimistic = async (
  queryClient: QueryClient,
  resource: string,
  rewrite: (data: unknown) => unknown,
) => {
  await queryClient.cancelQueries({ queryKey: [resource] });
  const snapshots = queryClient.getQueriesData({ queryKey: [resource] });
  queryClient.setQueriesData({ queryKey: [resource] }, rewrite);
  return snapshots;
};

const rollback = (queryClient: QueryClient, snapshots: [readonly unknown[], unknown][]) =>
  snapshots.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));

/** Create when no id is passed to mutate, update when it is. Updates apply optimistically. */
export const useSave = (resource: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id?: string | number } & Record<string, unknown>) =>
      (id ? await api.put(`/${resource}/${id}`, body) : await api.post(`/${resource}`, body)).data,
    onMutate: async ({ id, ...body }) => {
      if (id == null) return undefined;
      const snapshots = await applyOptimistic(queryClient, resource, (data) => {
        if (Array.isArray(data)) {
          return data.map((row) =>
            isEntity(row) && String(row.id) === String(id) ? { ...row, ...body } : row,
          );
        }
        if (isEntity(data) && String(data.id) === String(id)) return { ...data, ...body };
        return data;
      });
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      if (context) rollback(queryClient, context.snapshots);
    },
    onSettled: () => invalidateResourceQueries(queryClient, resource),
  });
};

/** Deletes apply optimistically: the row leaves cached lists immediately. */
export const useRemove = (resource: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/${resource}/${id}`),
    onMutate: async (id) => {
      const snapshots = await applyOptimistic(queryClient, resource, (data) =>
        Array.isArray(data)
          ? data.filter((row) => !(isEntity(row) && String(row.id) === String(id)))
          : data);
      return { snapshots };
    },
    onError: (_error, _id, context) => {
      if (context) rollback(queryClient, context.snapshots);
    },
    onSettled: () => invalidateResourceQueries(queryClient, resource),
  });
};
