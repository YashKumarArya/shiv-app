import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import type { PatrolCheckpoint, PatrolRoute, PatrolSchedule } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { depth } from '@/components/ui/depth';
import { InfoRow } from '@/components/ui/InfoRow';
import { Screen } from '@/components/ui/Screen';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const describeDays = (days: number[]) => {
  if (days.length === 7) return 'Every day';
  if (days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day))) return 'Mon–Fri';
  return [...days].sort((a, b) => a - b).map((day) => DAY_LABELS[day - 1]).join(', ');
};

const Section = ({
  title, actionLabel, onAction, children,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
  children: React.ReactNode;
}) => (
  <View style={depth.subtle} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
    <View className="mb-2 flex-row items-center justify-between">
      <Text className="text-base font-extrabold text-slate-800">{title}</Text>
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        className="min-h-11 flex-row items-center justify-center rounded-xl bg-brand-50 px-3 active:bg-brand-100"
      >
        <Ionicons name="add" size={17} color="#2457d6" />
        <Text className="ml-1 font-bold text-brand-600">Add</Text>
      </Pressable>
    </View>
    {children}
  </View>
);

export default function PatrolRouteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const routeId = Number(id);

  const route = useQuery<PatrolRoute>({
    queryKey: ['patrols/routes', String(routeId)],
    queryFn: async () => (await api.get(`/patrols/routes/${routeId}`)).data,
    enabled: routeId > 0,
  });

  const checkpoints = useQuery<PatrolCheckpoint[]>({
    queryKey: ['patrols/checkpoints', { route_id: routeId }],
    queryFn: async () => (await api.get('/patrols/checkpoints', { params: { route_id: routeId, limit: 200 } })).data,
    enabled: routeId > 0,
  });

  const schedules = useQuery<PatrolSchedule[]>({
    queryKey: ['patrols/schedules', { route_id: routeId }],
    queryFn: async () => (await api.get('/patrols/schedules', { params: { route_id: routeId, limit: 200 } })).data,
    enabled: routeId > 0,
  });

  const refreshing = route.isRefetching || checkpoints.isRefetching || schedules.isRefetching;
  const refetchAll = () => {
    void route.refetch();
    void checkpoints.refetch();
    void schedules.refetch();
  };

  const missingCoordinates = (checkpoints.data ?? []).filter(
    (checkpoint) => checkpoint.latitude == null,
  ).length;

  return (
    <Screen
      loading={route.isLoading}
      error={route.isError ? errorMessage(route.error) : undefined}
      onRetry={refetchAll}
    >
      <Stack.Screen options={{ title: route.data?.route_name ?? 'Patrol Route' }} />
      <ScrollView
        contentContainerClassName="p-4 pb-10"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} />}
      >
        <View style={depth.subtle} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-lg font-extrabold text-slate-900">{route.data?.route_name}</Text>
            <Badge label={route.data?.is_active ? 'Active' : 'Inactive'} />
          </View>
          <InfoRow label="Site" value={route.data?.site_name} />
          <InfoRow label="Description" value={route.data?.description} />
          <InfoRow label="Allowed distance" value={`${route.data?.geofence_metres} m from each checkpoint`} />
          <InfoRow label="Grace period" value={`${route.data?.grace_minutes} minutes after start`} />
          <View className="mt-3">
            <Button
              title="Edit route"
              variant="secondary"
              icon="create-outline"
              onPress={() => router.push(`/patrols/form?id=${routeId}`)}
            />
          </View>
        </View>

        <Section
          title="Checkpoints"
          actionLabel="Add checkpoint"
          onAction={() => router.push(`/patrols/checkpoint-form?route_id=${routeId}`)}
        >
          {(checkpoints.data ?? []).length === 0 ? (
            <Text className="py-3 text-sm text-slate-500">
              No checkpoints yet. Add one for each place the guard must physically reach.
            </Text>
          ) : (
            (checkpoints.data ?? []).map((checkpoint) => (
              <Pressable
                key={checkpoint.id}
                onPress={() => router.push(`/patrols/checkpoint-form?id=${checkpoint.id}&route_id=${routeId}`)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${checkpoint.checkpoint_name}`}
                className="min-h-14 flex-row items-center border-b border-slate-100 py-2.5 active:bg-slate-50"
              >
                <View className="h-8 w-8 items-center justify-center rounded-full bg-brand-50">
                  <Text className="text-xs font-extrabold text-brand-600">{checkpoint.sequence}</Text>
                </View>
                <View className="ml-3 flex-1">
                  <Text className="font-semibold text-slate-800">{checkpoint.checkpoint_name}</Text>
                  <Text className="mt-0.5 text-xs text-slate-500">
                    {checkpoint.latitude == null ? 'No location recorded' : 'Location recorded'}
                    {checkpoint.is_active ? '' : ' · Inactive'}
                  </Text>
                </View>
                <Ionicons
                  name={checkpoint.latitude == null ? 'warning-outline' : 'location'}
                  size={17}
                  color={checkpoint.latitude == null ? '#d97706' : '#059669'}
                />
              </Pressable>
            ))
          )}

          {missingCoordinates > 0 ? (
            <View className="mt-3 rounded-xl bg-amber-50 p-3">
              <Text className="text-xs leading-5 text-amber-800">
                {missingCoordinates} checkpoint{missingCoordinates === 1 ? ' has' : 's have'} no recorded
                location, so {missingCoordinates === 1 ? 'it' : 'they'} can be scanned from anywhere. Open
                {missingCoordinates === 1 ? ' it' : ' each one'} while standing at the checkpoint and tap
                “Use my current location”.
              </Text>
            </View>
          ) : null}

          {(checkpoints.data ?? []).length > 0 ? (
            <View className="mt-3">
              <Button
                title="Print QR stickers"
                variant="secondary"
                icon="qr-code-outline"
                onPress={() => router.push(`/patrols/qr-sheet?route_id=${routeId}`)}
              />
            </View>
          ) : null}
        </Section>

        <Section
          title="Patrol times"
          actionLabel="Add patrol time"
          onAction={() => router.push(`/patrols/schedule-form?route_id=${routeId}`)}
        >
          {(schedules.data ?? []).length === 0 ? (
            <Text className="py-3 text-sm text-slate-500">
              No times set. Guards posted to this site get a reminder at each time you add.
            </Text>
          ) : (
            (schedules.data ?? []).map((schedule) => (
              <Pressable
                key={schedule.id}
                onPress={() => router.push(`/patrols/schedule-form?id=${schedule.id}&route_id=${routeId}`)}
                accessibilityRole="button"
                accessibilityLabel={`Edit the ${schedule.start_time} round`}
                className="min-h-14 flex-row items-center border-b border-slate-100 py-2.5 active:bg-slate-50"
              >
                <Ionicons name="alarm-outline" size={19} color="#2457d6" />
                <View className="ml-3 flex-1">
                  <Text className="font-semibold text-slate-800">{schedule.start_time}</Text>
                  <Text className="mt-0.5 text-xs text-slate-500">
                    {describeDays(schedule.days_of_week)}
                    {schedule.is_active ? '' : ' · Inactive'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#b0bccb" />
              </Pressable>
            ))
          )}
        </Section>
      </ScrollView>
    </Screen>
  );
}
