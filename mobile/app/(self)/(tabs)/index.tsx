import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import type { GuardRoute, PatrolRound, PatrolToday } from '@/api/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';
import { usePatrolQueue } from '@/hooks/usePatrolQueue';
import { today } from '@/lib/format';
import { syncPatrolReminders } from '@/lib/patrolReminders';
import {
  dismissBlock,
  enqueue,
  getLocalSessions,
  localSessionKey,
  pruneLocalSessions,
  rememberLocalSession,
} from '@/lib/patrolQueue';

type RoundState = 'Completed' | 'In progress' | 'Due' | 'Missed' | 'Upcoming';

const minutesSinceMidnight = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const roundState = (round: PatrolRound, route: GuardRoute, nowMinutes: number): RoundState => {
  if (round.session?.completed_at) return 'Completed';
  if (round.session) return 'In progress';
  const start = minutesSinceMidnight(round.start_time);
  if (nowMinutes < start) return 'Upcoming';
  return nowMinutes <= start + route.grace_minutes ? 'Due' : 'Missed';
};

const STATE_STYLES: Record<RoundState, { tone: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  Completed: { tone: 'bg-emerald-50', text: 'text-emerald-700', icon: 'checkmark-circle' },
  'In progress': { tone: 'bg-blue-50', text: 'text-blue-700', icon: 'walk' },
  Due: { tone: 'bg-amber-50', text: 'text-amber-700', icon: 'alarm' },
  Missed: { tone: 'bg-red-50', text: 'text-red-700', icon: 'close-circle' },
  Upcoming: { tone: 'bg-slate-100', text: 'text-slate-600', icon: 'time-outline' },
};

export default function GuardPatrol() {
  const router = useRouter();
  const queue = usePatrolQueue();

  const patrol = useQuery<PatrolToday>({
    queryKey: ['patrols/my/today'],
    queryFn: async () => (await api.get('/patrols/my/today')).data,
    // A round is time-critical; do not serve a half-hour-old board.
    staleTime: 60_000,
  });

  // Keep the device's reminder alarms in step with whatever the office has
  // scheduled, every time fresh patrol data arrives.
  useEffect(() => {
    if (!patrol.data) return;
    void syncPatrolReminders(patrol.data);
    void pruneLocalSessions(today());
  }, [patrol.data]);

  // Round state is time-derived, so it has to advance on its own. Without a
  // tick a guard watching the screen at the start time keeps seeing "Upcoming"
  // until something unrelated re-renders.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const openRound = async (route: GuardRoute, round: PatrolRound | null) => {
    const scheduleId = round?.schedule_id ?? null;
    const key = localSessionKey(route.id, scheduleId, today());
    const sessions = await getLocalSessions();
    const stored = sessions[key];

    // Prefer the server's identity for a round already synced, so resuming
    // after a reinstall attaches to the existing session rather than a new one.
    let clientUuid = round?.session?.client_uuid;

    if (!clientUuid && stored) {
      // Extra rounds all share one local key, so a stored id may belong to an
      // extra round already finished. Resume it only while it is still open,
      // otherwise a second incident on the same day could not be recorded.
      const storedSession = scheduleId === null
        ? route.unscheduled_sessions.find((session) => session.client_uuid === stored)
        : undefined;
      const finished = scheduleId === null && storedSession?.completed_at != null;
      if (!finished) clientUuid = stored;
    }

    if (!clientUuid) {
      clientUuid = Crypto.randomUUID();
      await rememberLocalSession(key, clientUuid);
      await enqueue({
        kind: 'start',
        id: Crypto.randomUUID(),
        sessionClientUuid: clientUuid,
        routeId: route.id,
        scheduleId,
        startedAt: new Date().toISOString(),
      });
      queue.retry();
    }

    router.push(
      `/patrol/round?route_id=${route.id}&client_uuid=${clientUuid}` +
      (scheduleId ? `&schedule_id=${scheduleId}` : ''),
    );
  };

  return (
    <Screen>
      {patrol.isLoading ? (
        <ActivityIndicator className="mt-12" color="#2457d6" />
      ) : patrol.isError ? (
        <View className="p-4">
          <EmptyState
            title="Couldn’t load your patrols"
            message={errorMessage(patrol.error)}
            icon="cloud-offline-outline"
          />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="p-4 pb-10"
          refreshControl={
            <RefreshControl refreshing={patrol.isRefetching} onRefresh={() => void patrol.refetch()} />
          }
        >
          {queue.blockedReason ? (
            <View className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3.5">
              <View className="flex-row items-center">
                <Ionicons name="warning" size={20} color="#dc2626" />
                <Text className="ml-2 flex-1 font-bold text-red-700">Checkpoint not accepted</Text>
              </View>
              <Text className="mt-1 text-sm leading-5 text-red-700">{queue.blockedReason}</Text>
              <Text className="mt-2 text-xs leading-5 text-red-600">
                Nothing else will upload until this is cleared. Walk back and scan again, or discard it.
              </Text>
              <Pressable
                onPress={() => void dismissBlock().then(() => queue.retry())}
                accessibilityRole="button"
                accessibilityLabel="Discard the rejected checkpoint"
                className="mt-3 min-h-12 items-center justify-center rounded-xl bg-white active:bg-slate-100"
              >
                <Text className="font-bold text-red-700">Discard it and continue</Text>
              </Pressable>
            </View>
          ) : queue.pendingCount > 0 ? (
            <View className="mb-4 flex-row items-center rounded-2xl border border-violet-200 bg-violet-50 p-3.5">
              <Ionicons name="cloud-upload-outline" size={20} color="#7c3aed" />
              <Text className="ml-2 flex-1 text-sm font-semibold leading-5 text-violet-700">
                {queue.pendingCount} item{queue.pendingCount === 1 ? '' : 's'} waiting to upload. They send
                automatically when you have signal.
              </Text>
            </View>
          ) : null}

          {!patrol.data?.location ? (
            <EmptyState
              title="No site posting"
              message="You are not currently posted to a site. Contact your supervisor."
              icon="business-outline"
            />
          ) : (
            <>
              <View style={depth.subtle} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">Your site</Text>
                <Text className="mt-1 text-lg font-extrabold text-slate-900">
                  {patrol.data.location.site_name}
                </Text>
              </View>

              {patrol.data.routes.length === 0 ? (
                <EmptyState
                  title="No patrol routes"
                  message="No patrol route has been set up for your site yet."
                  icon="map-outline"
                />
              ) : (
                patrol.data.routes.map((route) => (
                  <View key={route.id} className="mb-5">
                    <View className="mb-2 flex-row items-center justify-between px-1">
                      <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        {route.route_name}
                      </Text>
                      <Text className="text-xs text-slate-400">
                        {route.checkpoints.length} checkpoint{route.checkpoints.length === 1 ? '' : 's'}
                      </Text>
                    </View>

                    <View style={depth.subtle} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      {route.rounds.length === 0 ? (
                        <Text className="p-4 text-sm text-slate-500">
                          No rounds scheduled for today on this route.
                        </Text>
                      ) : (
                        route.rounds.map((round, index) => {
                          const state = roundState(round, route, nowMinutes);
                          const style = STATE_STYLES[state];
                          const scanned = round.session?.scans.length ?? 0;
                          return (
                            <Pressable
                              key={round.schedule_id}
                              onPress={() => void openRound(route, round)}
                              accessibilityRole="button"
                              accessibilityLabel={`${round.start_time} round, ${state}`}
                              className={`min-h-[72px] flex-row items-center px-3.5 py-3 active:bg-slate-50 ${
                                index < route.rounds.length - 1 ? 'border-b border-slate-100' : ''
                              }`}
                            >
                              <View className={`h-11 w-11 items-center justify-center rounded-xl ${style.tone}`}>
                                <Ionicons
                                  name={style.icon}
                                  size={20}
                                  color={
                                    state === 'Completed' ? '#059669'
                                      : state === 'Missed' ? '#dc2626'
                                        : state === 'Due' ? '#d97706' : '#475569'
                                  }
                                />
                              </View>
                              <View className="ml-3 flex-1">
                                <Text className="text-base font-bold text-slate-900">{round.start_time}</Text>
                                <Text className={`mt-0.5 text-xs font-semibold ${style.text}`}>
                                  {state}
                                  {scanned > 0 && state !== 'Completed'
                                    ? ` · ${scanned}/${route.checkpoints.length} done`
                                    : ''}
                                </Text>
                              </View>
                              <Ionicons name="chevron-forward" size={17} color="#b0bccb" />
                            </Pressable>
                          );
                        })
                      )}
                    </View>

                    <Pressable
                      onPress={() => void openRound(route, null)}
                      accessibilityRole="button"
                      accessibilityLabel={`Start an extra round on ${route.route_name}`}
                      className="mt-2 min-h-12 flex-row items-center justify-center rounded-xl bg-white px-3 active:bg-slate-50"
                    >
                      <Ionicons name="add-circle-outline" size={18} color="#2457d6" />
                      <Text className="ml-2 font-bold text-brand-600">Start an extra round</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
