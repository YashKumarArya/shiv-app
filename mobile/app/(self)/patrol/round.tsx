import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import type { PatrolToday } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Illustration } from '@/components/ui/Illustration';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';
import { usePatrolQueue } from '@/hooks/usePatrolQueue';
import { confirmAction } from '@/lib/confirm';
import { notify } from '@/lib/notify';
import { dismissBlock, enqueue, locallyScannedCheckpointIds } from '@/lib/patrolQueue';

export default function PatrolRound() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    route_id?: string;
    client_uuid?: string;
    schedule_id?: string;
  }>();
  const routeId = Number(params.route_id);
  const clientUuid = params.client_uuid ?? '';
  const queue = usePatrolQueue();

  const patrol = useQuery<PatrolToday>({
    queryKey: ['patrols/my/today'],
    queryFn: async () => (await api.get('/patrols/my/today')).data,
  });

  const route = patrol.data?.routes.find((entry) => entry.id === routeId);
  const session =
    route?.rounds.find((round) => round.session?.client_uuid === clientUuid)?.session
    ?? route?.unscheduled_sessions.find((entry) => entry.client_uuid === clientUuid)
    ?? null;

  // A checkpoint counts as done once it is recorded anywhere: confirmed by the
  // server, or sitting in this device's queue waiting for signal.
  const confirmed = new Set(session?.scans.map((scan) => scan.checkpoint_id) ?? []);
  const queued = new Set(locallyScannedCheckpointIds(queue, clientUuid));
  const isScanned = (checkpointId: number) => confirmed.has(checkpointId) || queued.has(checkpointId);

  const checkpoints = route?.checkpoints ?? [];
  const remaining = checkpoints.filter((checkpoint) => !isScanned(checkpoint.id));
  const nextCheckpoint = remaining[0];

  const finishRound = () => {
    const finish = async () => {
      await enqueue({ kind: 'complete', id: Crypto.randomUUID(), sessionClientUuid: clientUuid });
      queue.retry();
      router.back();
    };

    if (remaining.length) {
      confirmAction({
        title: `Finish with ${remaining.length} checkpoint${remaining.length === 1 ? '' : 's'} left?`,
        message: `${remaining.map((checkpoint) => checkpoint.checkpoint_name).join(', ')} ${
          remaining.length === 1 ? 'was' : 'were'
        } not scanned. Your supervisor will see this round as incomplete.`,
        confirmText: 'Finish anyway',
        destructive: true,
        onConfirm: () => void finish(),
      });
      return;
    }
    void finish();
  };

  if (patrol.isLoading) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color="#2457d6" />
      </Screen>
    );
  }

  if (!route) {
    return (
      <Screen
        error={patrol.isError ? errorMessage(patrol.error) : 'This patrol route is no longer available.'}
        onRetry={() => void patrol.refetch()}
      />
    );
  }

  const done = checkpoints.length - remaining.length;

  return (
    <Screen
      footer={(
        <View className="gap-2">
          {nextCheckpoint ? (
            <Button
              title={`Scan ${nextCheckpoint.checkpoint_name}`}
              icon="qr-code-outline"
              onPress={() =>
                router.push(`/patrol/scan?route_id=${routeId}&client_uuid=${clientUuid}`)
              }
            />
          ) : null}
          <Button
            title={remaining.length ? 'Finish round early' : 'Finish round'}
            variant={remaining.length ? 'secondary' : 'primary'}
            icon="checkmark-done"
            onPress={finishRound}
          />
        </View>
      )}
    >
      <ScrollView contentContainerClassName="p-4 pb-6">
        {queue.blockedReason ? (
          <View className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4">
            <View className="flex-row items-center">
              <Ionicons name="warning" size={19} color="#dc2626" />
              <Text className="ml-2 flex-1 font-bold text-red-700">Checkpoint not accepted</Text>
            </View>
            <Text className="mt-1 text-sm leading-5 text-red-700">{queue.blockedReason}</Text>
            <Pressable
              onPress={() => {
                void dismissBlock().then(() => queue.retry());
              }}
              accessibilityRole="button"
              className="mt-3 min-h-12 items-center justify-center rounded-xl bg-white active:bg-slate-100"
            >
              <Text className="font-bold text-red-700">Discard it and continue</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={depth.subtle} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <View className="flex-row items-center">
            <View className="min-w-0 flex-1">
              <Text className="text-lg font-extrabold text-slate-900">{route.route_name}</Text>
              <Text className="mt-1 text-sm text-slate-500">
                {done} of {checkpoints.length} checkpoints scanned
              </Text>
            </View>
            {checkpoints.length > 0 && remaining.length === 0 ? (
              <Illustration name="completed-checklist" size={74} accessibilityLabel="All checkpoints scanned" />
            ) : null}
          </View>
          <View className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <View
              className="h-full rounded-full bg-brand-600"
              style={{ width: `${checkpoints.length ? (done / checkpoints.length) * 100 : 0}%` }}
            />
          </View>
        </View>

        <View style={depth.subtle} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {checkpoints.map((checkpoint, index) => {
            const scanned = isScanned(checkpoint.id);
            const pending = queued.has(checkpoint.id) && !confirmed.has(checkpoint.id);
            return (
              <View
                key={checkpoint.id}
                className={`min-h-16 flex-row items-center px-3.5 py-3 ${
                  index < checkpoints.length - 1 ? 'border-b border-slate-100' : ''
                }`}
              >
                <View
                  className={`h-9 w-9 items-center justify-center rounded-full ${
                    scanned ? 'bg-emerald-50' : 'bg-slate-100'
                  }`}
                >
                  {scanned ? (
                    <Ionicons name="checkmark" size={18} color="#059669" />
                  ) : (
                    <Text className="text-xs font-extrabold text-slate-500">{checkpoint.sequence}</Text>
                  )}
                </View>
                <View className="ml-3 flex-1">
                  <Text className={`font-semibold ${scanned ? 'text-slate-400' : 'text-slate-800'}`}>
                    {checkpoint.checkpoint_name}
                  </Text>
                  {pending ? (
                    <Text className="mt-0.5 text-xs text-violet-700">Saved · waiting for signal</Text>
                  ) : checkpoint.latitude == null ? (
                    <Text className="mt-0.5 text-xs text-slate-400">No location check</Text>
                  ) : null}
                </View>
                {!scanned && checkpoint.id === nextCheckpoint?.id ? (
                  <Pressable
                    onPress={() =>
                      router.push(`/patrol/scan?route_id=${routeId}&client_uuid=${clientUuid}`)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Scan ${checkpoint.checkpoint_name}`}
                    className="min-h-11 flex-row items-center rounded-xl bg-brand-50 px-3 active:bg-brand-100"
                  >
                    <Ionicons name="qr-code-outline" size={16} color="#2457d6" />
                    <Text className="ml-1.5 font-bold text-brand-600">Scan</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>

        <Text className="mt-4 px-1 text-xs leading-5 text-slate-400">
          Scan the sticker at each checkpoint and take a photo of yourself there. Everything is saved on
          your phone and uploads by itself when you have signal.
        </Text>
      </ScrollView>
    </Screen>
  );
}
