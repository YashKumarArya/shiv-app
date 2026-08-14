import type { QueryClient } from '@tanstack/react-query';

const relatedQueries: Record<string, readonly string[]> = {
  employees: ['attendance', 'assignments', 'documents', 'payments', 'uniforms', 'dashboard'],
  designations: ['employees', 'payments', 'uniforms', 'dashboard'],
  locations: ['assignments', 'attendance', 'dashboard'],
  assignments: ['attendance'],
  attendance: ['payments', 'dashboard'],
  payments: ['dashboard'],
  uniforms: ['dashboard'],
  // The route list carries checkpoint and schedule counts, and the patrol board
  // is derived from all three, so editing any part refreshes the rest.
  'patrols/routes': ['patrols/compliance'],
  'patrols/checkpoints': ['patrols/routes', 'patrols/compliance'],
  'patrols/schedules': ['patrols/routes', 'patrols/compliance'],
};

/** Invalidates query families together so joined and calculated screens cannot keep stale data. */
export const invalidateQueryRoots = async (queryClient: QueryClient, roots: Iterable<string>) => {
  const uniqueRoots = [...new Set(roots)];
  await Promise.all(
    uniqueRoots.map((root) => queryClient.invalidateQueries({ queryKey: [root] })),
  );
};

export const invalidateResourceQueries = (queryClient: QueryClient, resource: string) =>
  invalidateQueryRoots(queryClient, [resource, ...(relatedQueries[resource] ?? [])]);
