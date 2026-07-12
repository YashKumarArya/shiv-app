import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import { employeeName } from '@/api/types';
import { DateStepper } from '@/components/DateStepper';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FAB } from '@/components/ui/FAB';
import { Screen } from '@/components/ui/Screen';
import { today } from '@/lib/format';

type Status = 'Present' | 'Absent' | 'Half Day' | 'Leave';

// Tap the status pill to cycle: unmarked → Present → Absent → Half Day → Leave → Present
const next: Record<Status, Status> = { Present: 'Absent', Absent: 'Half Day', 'Half Day': 'Leave', Leave: 'Present' };

interface RosterRow {
  employee_id: number;
  first_name: string;
  last_name?: string;
  employee_code: string;
  shift?: string;
  site_name?: string;
  attendance_id?: number;
  status?: Status;
  present_days: number;
}

export default function AttendanceTab() {
  const [date, setDate] = useState(today());
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['attendance'] });
  const onError = (error: unknown) => Alert.alert('Failed to mark attendance', errorMessage(error));

  const { data, isLoading, isRefetching, refetch } = useQuery<RosterRow[]>({
    queryKey: ['attendance', 'roster', date],
    queryFn: async () => (await api.get('/attendance/roster', { params: { date } })).data,
  });

  const mark = useMutation({
    mutationFn: ({ row, status }: { row: RosterRow; status: Status }) =>
      row.attendance_id
        ? api.put(`/attendance/${row.attendance_id}`, { status })
        : api.post('/attendance', { employee_id: row.employee_id, attendance_date: date, status }),
    onSuccess: invalidate,
    onError,
  });

  const markAll = useMutation({
    mutationFn: () => api.post('/attendance/mark-all-present', { date }),
    onSuccess: invalidate,
    onError,
  });

  const cycle = (row: RosterRow) => mark.mutate({ row, status: row.status ? next[row.status] : 'Present' });
  const present = data?.filter((row) => row.status === 'Present').length ?? 0;
  const unmarked = data?.filter((row) => !row.status).length ?? 0;

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-28"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <DateStepper value={date} onChange={setDate} />

        <View className="mx-4 mt-3 flex-row items-center justify-between">
          <Text className="text-xs text-slate-500">
            Present {present} of {data?.length ?? 0} · Unmarked {unmarked}
          </Text>
          <Pressable onPress={() => markAll.mutate()} disabled={markAll.isPending || unmarked === 0}>
            <Text className={`text-xs font-semibold ${unmarked === 0 ? 'text-slate-300' : 'text-blue-600'}`}>
              Mark All Present
            </Text>
          </Pressable>
        </View>

        {isLoading ? (
          <ActivityIndicator className="mt-12" />
        ) : !data?.length ? (
          <EmptyState message="No active employees" />
        ) : (
          <View className="mx-4 mt-3 overflow-hidden rounded-2xl bg-white shadow-sm">
            <View className="flex-row items-center border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <Text className="flex-1 text-xs font-semibold uppercase text-slate-400">Employee</Text>
              <Text className="w-12 text-center text-xs font-semibold uppercase text-slate-400">Days</Text>
              <Text className="w-20 text-right text-xs font-semibold uppercase text-slate-400">Status</Text>
            </View>
            {data.map((row) => (
              <View key={row.employee_id} className="flex-row items-center border-b border-slate-100 px-4 py-2.5">
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-semibold text-slate-800">{employeeName(row)}</Text>
                  <Text className="mt-0.5 text-xs text-slate-500">
                    {[row.site_name ?? 'Unassigned', row.shift].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text className="w-12 text-center text-sm font-bold text-green-600">{row.present_days}</Text>
                <Pressable
                  className="w-20 items-end py-1"
                  onPress={() => cycle(row)}
                  disabled={mark.isPending}
                >
                  <Badge label={row.status ?? 'Mark'} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Text className="mx-4 mt-2 text-[11px] text-slate-400">
          Days = days present this month. Tap a status to change it.
        </Text>
      </ScrollView>
      <FAB href={`/attendance/mark?date=${date}`} />
    </Screen>
  );
}
