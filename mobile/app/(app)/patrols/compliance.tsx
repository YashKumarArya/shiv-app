import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import { employeeName, type PatrolComplianceRow, type PatrolStatus } from '@/api/types';
import { DateStepper } from '@/components/DateStepper';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';
import { today } from '@/lib/format';

const STATUS_STYLES: Record<PatrolStatus, { tone: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  Completed: { tone: 'bg-emerald-50', text: 'text-emerald-700', icon: 'checkmark-circle' },
  Partial: { tone: 'bg-amber-50', text: 'text-amber-700', icon: 'alert-circle' },
  Missed: { tone: 'bg-red-50', text: 'text-red-700', icon: 'close-circle' },
  Due: { tone: 'bg-blue-50', text: 'text-blue-700', icon: 'time' },
  Upcoming: { tone: 'bg-slate-100', text: 'text-slate-600', icon: 'ellipse-outline' },
};

export default function PatrolCompliance() {
  const [date, setDate] = useState(today());
  const router = useRouter();

  const compliance = useQuery<PatrolComplianceRow[]>({
    queryKey: ['patrols/compliance', date],
    queryFn: async () => (await api.get('/patrols/compliance', { params: { date } })).data,
    // Rounds change through the day; a stale board would show a live shift wrong.
    staleTime: 30_000,
  });

  const rows = compliance.data ?? [];
  const counts = rows.reduce<Record<string, number>>((totals, row) => {
    totals[row.status] = (totals[row.status] ?? 0) + 1;
    return totals;
  }, {});

  const bySite = rows.reduce<Record<string, PatrolComplianceRow[]>>((groups, row) => {
    (groups[row.site_name] ??= []).push(row);
    return groups;
  }, {});

  return (
    <Screen>
      <DateStepper value={date} onChange={setDate} label="Patrol date" />

      {compliance.isLoading ? (
        <ActivityIndicator className="mt-12" color="#2457d6" />
      ) : compliance.isError ? (
        <View className="p-4">
          <EmptyState
            title="Couldn’t load patrols"
            message={errorMessage(compliance.error)}
            icon="cloud-offline-outline"
          />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="p-4 pb-10"
          refreshControl={
            <RefreshControl refreshing={compliance.isRefetching} onRefresh={() => void compliance.refetch()} />
          }
        >
          {rows.length === 0 ? (
            <EmptyState
              title="No rounds scheduled"
              message="No active patrol route has a time set for this day."
              icon="map-outline"
            />
          ) : (
            <>
              <View className="mb-4 flex-row flex-wrap gap-2">
                {(Object.keys(STATUS_STYLES) as PatrolStatus[])
                  .filter((status) => counts[status])
                  .map((status) => (
                    <View
                      key={status}
                      className={`flex-row items-center rounded-xl px-3 py-2 ${STATUS_STYLES[status].tone}`}
                    >
                      <Ionicons
                        name={STATUS_STYLES[status].icon}
                        size={15}
                        color={status === 'Completed' ? '#059669' : status === 'Missed' ? '#dc2626' : '#475569'}
                      />
                      <Text className={`ml-1.5 text-sm font-bold ${STATUS_STYLES[status].text}`}>
                        {counts[status]} {status}
                      </Text>
                    </View>
                  ))}
              </View>

              {Object.entries(bySite).map(([siteName, siteRows]) => (
                <View key={siteName} className="mb-4">
                  <Text className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                    {siteName}
                  </Text>
                  <View style={depth.subtle} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {siteRows.map((row, index) => {
                      const style = STATUS_STYLES[row.status];
                      const walkedBy = row.employee_id ? employeeName(row) : null;
                      return (
                        <Pressable
                          key={`${row.schedule_id}-${row.route_id}`}
                          onPress={row.session_id ? () => router.push(`/patrols/session?id=${row.session_id}`) : undefined}
                          disabled={!row.session_id}
                          accessibilityRole={row.session_id ? 'button' : undefined}
                          accessibilityLabel={`${row.route_name} at ${row.start_time}, ${row.status}`}
                          className={`min-h-16 flex-row items-center px-3.5 py-3 ${
                            index < siteRows.length - 1 ? 'border-b border-slate-100' : ''
                          } ${row.session_id ? 'active:bg-slate-50' : ''}`}
                        >
                          <View className={`h-10 w-10 items-center justify-center rounded-xl ${style.tone}`}>
                            <Ionicons
                              name={style.icon}
                              size={19}
                              color={
                                row.status === 'Completed' ? '#059669'
                                  : row.status === 'Missed' ? '#dc2626'
                                    : row.status === 'Partial' ? '#d97706' : '#475569'
                              }
                            />
                          </View>
                          <View className="ml-3 flex-1">
                            <Text className="font-semibold text-slate-900">
                              {row.start_time} · {row.route_name}
                            </Text>
                            <Text className="mt-0.5 text-xs text-slate-500">
                              {row.scan_count}/{row.checkpoint_count} checkpoints
                              {walkedBy ? ` · ${walkedBy}` : ''}
                            </Text>
                          </View>
                          <Text className={`text-xs font-bold ${style.text}`}>{row.status}</Text>
                          {row.session_id ? (
                            <Ionicons name="chevron-forward" size={16} color="#b0bccb" style={{ marginLeft: 4 }} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
