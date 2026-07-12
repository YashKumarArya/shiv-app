import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import { employeeName } from '@/api/types';
import { DateStepper } from '@/components/DateStepper';
import { EmptyState } from '@/components/ui/EmptyState';
import { FAB } from '@/components/ui/FAB';
import { Screen } from '@/components/ui/Screen';
import { today } from '@/lib/format';

const statuses = ['Present', 'Absent', 'Half Day', 'Leave'] as const;
type Status = (typeof statuses)[number];

const activeChip: Record<Status, string> = {
  Present: 'border-green-600 bg-green-600',
  Absent: 'border-red-500 bg-red-500',
  'Half Day': 'border-amber-500 bg-amber-500',
  Leave: 'border-blue-500 bg-blue-500',
};

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

  const { data, isLoading, isRefetching, refetch } = useQuery<RosterRow[]>({
    queryKey: ['attendance', 'roster', date],
    queryFn: async () => (await api.get('/attendance/roster', { params: { date } })).data,
  });

  const mark = useMutation({
    mutationFn: ({ row, status }: { row: RosterRow; status: Status }) =>
      row.attendance_id
        ? api.put(`/attendance/${row.attendance_id}`, { status })
        : api.post('/attendance', { employee_id: row.employee_id, attendance_date: date, status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendance'] }),
    onError: (error) => Alert.alert('Failed to mark attendance', errorMessage(error)),
  });

  const present = data?.filter((row) => row.status === 'Present').length ?? 0;
  const unmarked = data?.filter((row) => !row.status).length ?? 0;

  return (
    <Screen>
      <DateStepper value={date} onChange={setDate} />
      <Text className="mx-4 mt-2 text-xs text-slate-500">
        Present {present} of {data?.length ?? 0} · Unmarked {unmarked}
      </Text>

      {isLoading ? (
        <ActivityIndicator className="mt-12" />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(row) => String(row.employee_id)}
          contentContainerClassName="p-4 pb-28"
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={<EmptyState message="No active employees" />}
          renderItem={({ item: row }) => (
            <View className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-2">
                  <Text className="text-base font-semibold text-slate-800">{employeeName(row)}</Text>
                  <Text className="mt-0.5 text-xs text-slate-500">
                    {[row.employee_code, row.site_name ?? 'Unassigned', row.shift && `${row.shift} shift`]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-base font-bold text-green-600">{row.present_days}</Text>
                  <Text className="text-[10px] text-slate-400">days this month</Text>
                </View>
              </View>

              <View className="mt-3 flex-row gap-2">
                {statuses.map((status) => {
                  const active = row.status === status;
                  return (
                    <Pressable
                      key={status}
                      onPress={() => mark.mutate({ row, status })}
                      disabled={mark.isPending || active}
                      className={`flex-1 items-center rounded-lg border px-1 py-1.5 ${active ? activeChip[status] : 'border-slate-200 bg-white'}`}
                    >
                      <Text className={`text-xs font-medium ${active ? 'text-white' : 'text-slate-600'}`}>
                        {status}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        />
      )}
      <FAB href={`/attendance/mark?date=${date}`} />
    </Screen>
  );
}
