import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Image, ScrollView, Text, View } from 'react-native';
import { api, errorMessage, fileUrl } from '@/api/client';
import { employeeName } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { InfoRow } from '@/components/ui/InfoRow';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';

interface SessionScan {
  id: number;
  checkpoint_id: number;
  checkpoint_name: string;
  sequence: number;
  scanned_at: string;
  server_received_at: string;
  photo: string;
  latitude: string | null;
  longitude: string | null;
  distance_metres: string | null;
}

interface SessionDetail {
  session: {
    id: number;
    route_name: string;
    site_name: string;
    start_time: string | null;
    patrol_date: string;
    started_at: string;
    completed_at: string | null;
    employee_code: string;
    first_name: string;
    last_name: string | null;
    geofence_metres: number;
  };
  scans: SessionScan[];
  checkpoints: { id: number; checkpoint_name: string; sequence: number }[];
}

const clockTime = (value: string) =>
  new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

/** Minutes between the scan and the server receiving it — the offline gap. */
const syncDelayMinutes = (scan: SessionScan) =>
  Math.round((new Date(scan.server_received_at).getTime() - new Date(scan.scanned_at).getTime()) / 60000);

export default function PatrolSessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = Number(id);

  const detail = useQuery<SessionDetail>({
    queryKey: ['patrols/sessions', String(sessionId)],
    queryFn: async () => (await api.get(`/patrols/sessions/${sessionId}`)).data,
    enabled: sessionId > 0,
  });

  const session = detail.data?.session;
  const scans = detail.data?.scans ?? [];
  const checkpoints = detail.data?.checkpoints ?? [];
  const missed = checkpoints.filter((checkpoint) => !scans.some((scan) => scan.checkpoint_id === checkpoint.id));

  return (
    <Screen
      loading={detail.isLoading}
      error={detail.isError ? errorMessage(detail.error) : undefined}
      onRetry={() => void detail.refetch()}
    >
      <ScrollView contentContainerClassName="p-4 pb-10">
        <View style={depth.subtle} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="flex-1 text-lg font-extrabold text-slate-900">{session?.route_name}</Text>
            <Badge label={session?.completed_at ? 'Completed' : 'Not finished'} />
          </View>
          <InfoRow label="Site" value={session?.site_name} />
          <InfoRow label="Guard" value={session ? `${employeeName(session)} (${session.employee_code})` : undefined} />
          <InfoRow label="Scheduled" value={session?.start_time ?? 'Unscheduled round'} />
          <InfoRow label="Started" value={session ? clockTime(session.started_at) : undefined} />
          <InfoRow
            label="Finished"
            value={session?.completed_at ? clockTime(session.completed_at) : 'Not finished'}
          />
          <InfoRow label="Checkpoints" value={`${scans.length} of ${checkpoints.length} scanned`} />
        </View>

        {missed.length ? (
          <View className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-4">
            <View className="flex-row items-center">
              <Ionicons name="close-circle" size={18} color="#dc2626" />
              <Text className="ml-2 font-bold text-red-700">
                {missed.length} checkpoint{missed.length === 1 ? '' : 's'} not scanned
              </Text>
            </View>
            <Text className="mt-1 text-sm leading-5 text-red-700">
              {missed.map((checkpoint) => checkpoint.checkpoint_name).join(', ')}
            </Text>
          </View>
        ) : null}

        {scans.map((scan) => {
          const delay = syncDelayMinutes(scan);
          const distance = scan.distance_metres == null ? null : Number(scan.distance_metres);
          return (
            <View
              key={scan.id}
              style={depth.subtle}
              className="mb-3 flex-row rounded-2xl border border-slate-200 bg-white p-3"
            >
              <Image
                source={{ uri: fileUrl(scan.photo) }}
                resizeMode="cover"
                accessibilityLabel={`Photo taken at ${scan.checkpoint_name}`}
                className="h-24 w-20 rounded-xl bg-slate-100"
              />
              <View className="ml-3 flex-1">
                <Text className="font-bold text-slate-800">
                  {scan.sequence}. {scan.checkpoint_name}
                </Text>
                <Text className="mt-1 text-xs text-slate-500">Scanned {clockTime(scan.scanned_at)}</Text>
                {distance !== null ? (
                  <View className="mt-1 flex-row items-center">
                    <Ionicons name="location" size={13} color="#059669" />
                    <Text className="ml-1 text-xs text-emerald-700">{Math.round(distance)} m from checkpoint</Text>
                  </View>
                ) : (
                  <View className="mt-1 flex-row items-center">
                    <Ionicons name="warning-outline" size={13} color="#d97706" />
                    <Text className="ml-1 text-xs text-amber-700">No location recorded for this checkpoint</Text>
                  </View>
                )}
                {delay >= 5 ? (
                  <View className="mt-1 flex-row items-center">
                    <Ionicons name="cloud-offline-outline" size={13} color="#7c3aed" />
                    <Text className="ml-1 text-xs text-violet-700">
                      Uploaded {delay} min later (scanned offline)
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
