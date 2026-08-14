import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  drainQueue,
  getQueue,
  subscribeToQueue,
  type QueueState,
} from '@/lib/patrolQueue';

/**
 * Exposes the offline patrol queue and keeps trying to empty it.
 *
 * Drains on mount, whenever the device regains connectivity, and whenever the
 * app returns to the foreground — the three moments a guard walking a basement
 * round actually gets signal back.
 */
export const usePatrolQueue = () => {
  const [state, setState] = useState<QueueState>({ pending: [] });
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = subscribeToQueue(setState);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      // Measure before draining. Comparing two drains would compare a drained
      // queue with itself and refetch on every foreground, including in a dead
      // zone where nothing was actually sent.
      const before = (await getQueue()).pending.length;
      const after = (await drainQueue()).pending.length;
      if (cancelled || before === after) return;
      void queryClient.invalidateQueries({ queryKey: ['patrols/my/today'] });
    };

    void sync();

    const netInfo = NetInfo.addEventListener((status) => {
      if (status.isConnected) void sync();
    });
    const appState = AppState.addEventListener('change', (status) => {
      if (status === 'active') void sync();
    });

    return () => {
      cancelled = true;
      netInfo();
      appState.remove();
    };
  }, [queryClient]);

  return {
    ...state,
    pendingCount: state.pending.length,
    retry: () => void drainQueue(),
  };
};
