import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, errorMessage, fileUrl } from '@/api/client';
import { employeeName } from '@/api/types';
import { DateStepper } from '@/components/DateStepper';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FAB } from '@/components/ui/FAB';
import { depth } from '@/components/ui/depth';
import { Screen } from '@/components/ui/Screen';
import { formatDate, today } from '@/lib/format';
import { confirmAction } from '@/lib/confirm';
import { notify } from '@/lib/notify';

type Status = 'Present' | 'Absent' | 'Half Day' | 'Leave';

const statuses: Status[] = ['Present', 'Absent', 'Half Day', 'Leave'];

const statusMeta: Record<
  Status,
  {
    icon: ComponentProps<typeof Ionicons>['name'];
    iconColor: string;
    iconBackground: string;
    summaryBackground: string;
    summaryText: string;
    dot: string;
  }
> = {
  Present: {
    icon: 'checkmark-circle-outline',
    iconColor: '#15803d',
    iconBackground: 'bg-green-100',
    summaryBackground: 'bg-green-50',
    summaryText: 'text-green-700',
    dot: 'bg-green-500',
  },
  Absent: {
    icon: 'close-circle-outline',
    iconColor: '#b91c1c',
    iconBackground: 'bg-red-100',
    summaryBackground: 'bg-red-50',
    summaryText: 'text-red-700',
    dot: 'bg-red-500',
  },
  'Half Day': {
    icon: 'time-outline',
    iconColor: '#b45309',
    iconBackground: 'bg-amber-100',
    summaryBackground: 'bg-amber-50',
    summaryText: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  Leave: {
    icon: 'calendar-outline',
    iconColor: '#1d4ed8',
    iconBackground: 'bg-blue-100',
    summaryBackground: 'bg-blue-50',
    summaryText: 'text-blue-700',
    dot: 'bg-blue-500',
  },
};

interface RosterRow {
  employee_id: number;
  first_name: string;
  last_name?: string;
  employee_code: string;
  photo?: string;
  shift?: string;
  site_name?: string;
  attendance_id?: number;
  status?: Status;
  worked_days: number;
}

const initials = (row: RosterRow) =>
  [row.first_name, row.last_name]
    .filter(Boolean)
    .map((part) => part![0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export default function AttendanceTab() {
  const router = useRouter();
  const [date, setDate] = useState(today());
  const [selectedRow, setSelectedRow] = useState<RosterRow | null>(null);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['attendance'] });
  const onError = (error: unknown) => notify('Failed to mark attendance', errorMessage(error));

  const { data, isError, isLoading, isRefetching, refetch } = useQuery<RosterRow[]>({
    queryKey: ['attendance', 'roster', date],
    queryFn: async () => (await api.get('/attendance/roster', { params: { date } })).data,
  });

  const mark = useMutation({
    mutationFn: ({ row, status }: { row: RosterRow; status: Status }) =>
      row.attendance_id
        ? api.put(`/attendance/${row.attendance_id}`, { status })
        : api.post('/attendance', { employee_id: row.employee_id, attendance_date: date, status }),
    onSuccess: async () => {
      await invalidate();
      setSelectedRow(null);
    },
    onError,
  });

  const markAll = useMutation({
    mutationFn: () => api.post('/attendance/mark-all-present', { date }),
    onSuccess: invalidate,
    onError,
  });

  const counts = statuses.reduce<Record<Status, number>>(
    (result, status) => {
      result[status] = data?.filter((row) => row.status === status).length ?? 0;
      return result;
    },
    { Present: 0, Absent: 0, 'Half Day': 0, Leave: 0 },
  );
  const unmarked = data?.filter((row) => !row.status).length ?? 0;
  const total = data?.length ?? 0;

  const confirmMarkAll = () => {
    if (unmarked === 0 || markAll.isPending) return;

    confirmAction({
      title: 'Mark all present?',
      message: `${unmarked} unmarked ${unmarked === 1 ? 'employee' : 'employees'} will be marked Present for ${formatDate(date)}. Existing attendance will not change.`,
      confirmText: 'Mark Present',
      onConfirm: () => markAll.mutate(),
    });
  };

  const closeStatusPicker = () => {
    if (!mark.isPending) setSelectedRow(null);
  };

  return (
    <Screen>
      <ScrollView
        className="flex-1 bg-transparent"
        contentContainerClassName="pb-28"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <DateStepper value={date} onChange={setDate} />

        {!isError ? <View style={depth.raised} className="mx-4 mt-4 rounded-2xl border border-white/80 bg-white p-4">
          <View className="flex-row items-start justify-between">
            <View>
              <Text className="text-base font-bold text-slate-900">Daily overview</Text>
              <Text className="mt-0.5 text-xs text-slate-500">
                {total} active {total === 1 ? 'employee' : 'employees'}
              </Text>
            </View>
            <View className="rounded-full bg-slate-100 px-2.5 py-1">
              <Text className="text-xs font-semibold text-slate-600">{unmarked} unmarked</Text>
            </View>
          </View>

          <View className="mt-3 flex-row flex-wrap gap-2">
            {statuses.map((status) => {
              const meta = statusMeta[status];
              return (
                <View
                  key={status}
                  className={`flex-row items-center rounded-full px-2.5 py-1.5 ${meta.summaryBackground}`}
                  accessibilityLabel={`${status}, ${counts[status]}`}
                >
                  <View className={`mr-1.5 h-2 w-2 rounded-full ${meta.dot}`} />
                  <Text className={`text-xs font-semibold ${meta.summaryText}`}>
                    {status} {counts[status]}
                  </Text>
                </View>
              );
            })}
          </View>

          <Pressable
            onPress={confirmMarkAll}
            disabled={unmarked === 0 || markAll.isPending || mark.isPending}
            className={`mt-4 h-12 flex-row items-center justify-center rounded-xl ${
              unmarked === 0 || markAll.isPending || mark.isPending ? 'bg-slate-100' : 'bg-blue-600 active:bg-blue-700'
            }`}
            accessibilityRole="button"
            accessibilityLabel={`Mark all present, ${unmarked} unmarked ${unmarked === 1 ? 'employee' : 'employees'}`}
            accessibilityState={{ disabled: unmarked === 0 || markAll.isPending || mark.isPending, busy: markAll.isPending }}
          >
            {markAll.isPending ? (
              <ActivityIndicator size="small" color="#64748b" />
            ) : (
              <Ionicons name="checkmark-done" size={19} color={unmarked === 0 || mark.isPending ? '#94a3b8' : '#ffffff'} />
            )}
            <Text
              className={`ml-2 text-sm font-bold ${
                unmarked === 0 || markAll.isPending || mark.isPending ? 'text-slate-400' : 'text-white'
              }`}
            >
              {unmarked === 0 ? 'Everyone is marked' : 'Mark All Present'}
            </Text>
          </Pressable>
        </View> : null}

        {isLoading ? (
          <ActivityIndicator className="mt-12" />
        ) : isError ? (
          <EmptyState
            title="Couldn’t load attendance"
            message="Check your connection, then try loading the roster again."
            icon="cloud-offline-outline"
            action={(
              <Pressable
                onPress={() => refetch()}
                accessibilityRole="button"
                className="min-h-12 justify-center rounded-xl bg-brand-50 px-5"
              >
                <Text className="font-bold text-brand-600">Try again</Text>
              </Pressable>
            )}
          />
        ) : !data?.length ? (
          <EmptyState message="No active employees" />
        ) : (
          <View style={depth.raised} className="mx-4 mt-4 rounded-2xl">
            <View className="overflow-hidden rounded-2xl border border-white/80 bg-white">
              <View className="border-b border-slate-100 px-4 py-3">
              <Text className="text-base font-bold text-slate-900">Employees</Text>
              <Text className="mt-0.5 text-xs text-slate-500">Choose a status to record or update attendance</Text>
              </View>

            {data.map((row, index) => {
              const name = employeeName(row);
              const isPending = mark.isPending && mark.variables?.row.employee_id === row.employee_id;
              const assignment = [row.site_name ?? 'Unassigned', row.shift].filter(Boolean).join(' · ');

              return (
                <View
                  key={row.employee_id}
                  className={`px-4 py-3.5 ${index < data.length - 1 ? 'border-b border-slate-100' : ''}`}
                >
                  <View className="flex-row items-center">
                    <Pressable
                      onPress={() => router.push(`/attendance/${row.employee_id}` as Href)}
                      accessibilityRole="button"
                      accessibilityLabel={`Open attendance calendar for ${name}`}
                      accessibilityHint="Shows the days this employee worked"
                      className="min-h-14 flex-1 flex-row items-center rounded-xl active:bg-slate-50"
                    >
                      {row.photo ? (
                        <Image
                          source={{ uri: fileUrl(row.photo) }}
                          accessible={false}
                          resizeMode="cover"
                          className="h-11 w-11 rounded-xl bg-slate-100"
                        />
                      ) : (
                        <View
                          className="h-11 w-11 items-center justify-center rounded-xl bg-indigo-50"
                          accessible={false}
                        >
                          <Text className="text-sm font-bold text-indigo-700">{initials(row)}</Text>
                        </View>
                      )}

                      <View className="ml-3 flex-1 pr-2">
                        <Text className="text-[15px] font-bold text-slate-900" numberOfLines={1}>
                          {name}
                        </Text>
                        <Text className="mt-0.5 text-xs font-medium text-slate-500" numberOfLines={1}>
                          {row.employee_code} · {assignment}
                        </Text>
                        <View className="mt-1 flex-row items-center">
                          <Ionicons name="calendar-clear-outline" size={13} color="#64748b" />
                          <Text className="ml-1 text-[11px] font-semibold text-slate-500">
                            View calendar · {row.worked_days} {row.worked_days === 1 ? 'day' : 'days'} worked
                          </Text>
                        </View>
                      </View>
                    </Pressable>

                    <Pressable
                      className="min-h-12 min-w-[88px] flex-row items-center justify-end rounded-xl px-1 active:bg-slate-50"
                      onPress={() => setSelectedRow(row)}
                      disabled={isPending || markAll.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={`${name}, attendance status ${row.status ?? 'unmarked'}`}
                      accessibilityHint="Opens attendance status choices"
                      accessibilityState={{ disabled: isPending || markAll.isPending, busy: isPending }}
                    >
                      {isPending ? (
                        <ActivityIndicator size="small" color="#2563eb" />
                      ) : (
                        <>
                          <Badge label={row.status ?? 'Select'} />
                          <Ionicons name="chevron-down" size={15} color="#94a3b8" style={{ marginLeft: 3 }} />
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              );
              })}
            </View>
          </View>
        )}

        <Text className="mx-5 mt-2.5 text-[11px] leading-4 text-slate-400">
          Worked days count Present as 1 day and Half Day as 0.5 day.
        </Text>
      </ScrollView>

      <FAB href={`/attendance/mark?date=${date}`} label="Manual entry" withinTab />

      <Modal
        visible={selectedRow !== null}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeStatusPicker}
      >
        <View className="flex-1 justify-end">
          <Pressable
            className="absolute inset-0 bg-slate-950/45"
            onPress={closeStatusPicker}
            accessibilityRole="button"
            accessibilityLabel="Close attendance status choices"
          />

          <View
            accessibilityViewIsModal
            className="rounded-t-3xl border border-white/80 bg-white px-4 pt-3"
            style={[depth.chrome, { paddingBottom: Math.max(insets.bottom, 16) }]}
          >
            <View className="mb-3 h-1 w-10 self-center rounded-full bg-slate-300" />
            <View className="flex-row items-start justify-between px-1">
              <View className="flex-1 pr-4">
                <Text className="text-lg font-bold text-slate-900">Set attendance status</Text>
                <Text className="mt-0.5 text-sm text-slate-500" numberOfLines={1}>
                  {selectedRow ? `${employeeName(selectedRow)} · ${selectedRow.employee_code}` : ''}
                </Text>
              </View>
              <Pressable
                onPress={closeStatusPicker}
                disabled={mark.isPending}
                className="h-12 w-12 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200"
                accessibilityRole="button"
                accessibilityLabel="Close"
                accessibilityState={{ disabled: mark.isPending }}
              >
                <Ionicons name="close" size={22} color="#475569" />
              </Pressable>
            </View>

            <View className="mt-4 gap-2">
              {statuses.map((status) => {
                const meta = statusMeta[status];
                const isCurrent = selectedRow?.status === status;
                const isSaving = mark.isPending && mark.variables?.status === status;

                return (
                  <Pressable
                    key={status}
                    onPress={() => selectedRow && mark.mutate({ row: selectedRow, status })}
                    disabled={mark.isPending || isCurrent}
                    className={`min-h-14 flex-row items-center rounded-2xl border px-3 ${
                      isCurrent ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white active:bg-slate-50'
                    }`}
                    accessibilityRole="radio"
                    accessibilityLabel={status}
                    accessibilityState={{ checked: isCurrent, disabled: mark.isPending || isCurrent, busy: isSaving }}
                  >
                    <View className={`h-10 w-10 items-center justify-center rounded-xl ${meta.iconBackground}`}>
                      <Ionicons name={meta.icon} size={21} color={meta.iconColor} />
                    </View>
                    <Text className="ml-3 flex-1 text-[15px] font-semibold text-slate-800">{status}</Text>
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#2563eb" />
                    ) : isCurrent ? (
                      <View className="h-6 w-6 items-center justify-center rounded-full bg-blue-600">
                        <Ionicons name="checkmark" size={16} color="#ffffff" />
                      </View>
                    ) : (
                      <View className="h-6 w-6 rounded-full border-2 border-slate-300" />
                    )}
                  </Pressable>
                );
              })}
            </View>

            <View className="mt-3 flex-row items-center justify-center">
              <Ionicons name="flash-outline" size={13} color="#94a3b8" />
              <Text className="ml-1 text-xs text-slate-400">Changes are saved immediately</Text>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
