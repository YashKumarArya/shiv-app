import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';
import { formatDate, monthName } from '@/lib/format';

type AttendanceStatus = 'Present' | 'Half Day' | 'Absent' | 'Leave';

interface MyAttendance {
  month: string;
  days: {
    id: number;
    attendance_date: string;
    status: AttendanceStatus;
    check_in?: string | null;
    check_out?: string | null;
    site_name?: string | null;
  }[];
  summary: {
    present: number;
    half_day: number;
    absent: number;
    leave: number;
    worked_days: number;
    total_marked: number;
  };
}

const STATUS_STYLES: Record<AttendanceStatus, { tone: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  Present: { tone: 'bg-emerald-50', text: 'text-emerald-700', icon: 'checkmark-circle' },
  'Half Day': { tone: 'bg-amber-50', text: 'text-amber-700', icon: 'contrast' },
  Absent: { tone: 'bg-red-50', text: 'text-red-700', icon: 'close-circle' },
  Leave: { tone: 'bg-blue-50', text: 'text-blue-700', icon: 'airplane' },
};

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const shiftMonth = (month: string, delta: number) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return monthKey(new Date(year, monthNumber - 1 + delta, 1));
};

export default function MyAttendanceScreen() {
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const thisMonth = monthKey(new Date());

  const attendance = useQuery<MyAttendance>({
    queryKey: ['me/attendance', month],
    queryFn: async () => (await api.get('/me/attendance', { params: { month } })).data,
  });

  const [year, monthNumber] = month.split('-').map(Number);
  const summary = attendance.data?.summary;

  return (
    <Screen>
      <View className="mx-4 mt-4 flex-row items-center rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <Pressable
          onPress={() => setMonth(shiftMonth(month, -1))}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          className="h-12 w-12 items-center justify-center rounded-xl bg-slate-50 active:bg-slate-100"
        >
          <Ionicons name="chevron-back" size={21} color="#334155" />
        </Pressable>
        <View className="flex-1 items-center">
          <Text className="text-base font-bold text-slate-900">
            {monthName(monthNumber)} {year}
          </Text>
        </View>
        <Pressable
          onPress={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= thisMonth}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: month >= thisMonth }}
          className={`h-12 w-12 items-center justify-center rounded-xl bg-slate-50 ${
            month >= thisMonth ? 'opacity-40' : 'active:bg-slate-100'
          }`}
        >
          <Ionicons name="chevron-forward" size={21} color={month >= thisMonth ? '#94a3b8' : '#334155'} />
        </Pressable>
      </View>

      {attendance.isLoading ? (
        <ActivityIndicator className="mt-12" color="#2457d6" />
      ) : attendance.isError ? (
        <View className="p-4">
          <EmptyState
            title="Couldn’t load your attendance"
            message={errorMessage(attendance.error)}
            icon="cloud-offline-outline"
          />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="p-4 pb-10"
          refreshControl={
            <RefreshControl refreshing={attendance.isRefetching} onRefresh={() => void attendance.refetch()} />
          }
        >
          <View style={depth.subtle} className="mb-4 flex-row rounded-2xl border border-slate-200 bg-white p-4">
            {([
              ['Worked', summary?.worked_days ?? 0, 'text-slate-900'],
              ['Present', summary?.present ?? 0, 'text-emerald-700'],
              ['Half day', summary?.half_day ?? 0, 'text-amber-700'],
              ['Absent', summary?.absent ?? 0, 'text-red-700'],
            ] as const).map(([label, value, tone]) => (
              <View key={label} className="flex-1 items-center">
                <Text className={`text-xl font-extrabold ${tone}`}>{value}</Text>
                <Text className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {label}
                </Text>
              </View>
            ))}
          </View>

          {(attendance.data?.days ?? []).length === 0 ? (
            <EmptyState
              title="Nothing marked yet"
              message="Your attendance for this month has not been recorded."
              illustration="attendance-calendar"
            />
          ) : (
            <View style={depth.subtle} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {attendance.data!.days.map((day, index) => {
                const style = STATUS_STYLES[day.status];
                return (
                  <View
                    key={day.id}
                    className={`min-h-14 flex-row items-center px-3.5 py-3 ${
                      index < attendance.data!.days.length - 1 ? 'border-b border-slate-100' : ''
                    }`}
                  >
                    <View className={`h-9 w-9 items-center justify-center rounded-xl ${style.tone}`}>
                      <Ionicons
                        name={style.icon}
                        size={17}
                        color={
                          day.status === 'Present' ? '#059669'
                            : day.status === 'Absent' ? '#dc2626'
                              : day.status === 'Half Day' ? '#d97706' : '#2563eb'
                        }
                      />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="font-semibold text-slate-800">{formatDate(day.attendance_date)}</Text>
                      {day.site_name ? (
                        <Text className="mt-0.5 text-xs text-slate-500">{day.site_name}</Text>
                      ) : null}
                    </View>
                    <Text className={`text-xs font-bold ${style.text}`}>{day.status}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
