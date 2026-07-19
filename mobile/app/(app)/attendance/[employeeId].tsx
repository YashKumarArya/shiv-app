import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/api/client';
import { employeeInitials, employeeName } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { depth } from '@/components/ui/depth';
import { Screen } from '@/components/ui/Screen';
import { formatDate } from '@/lib/format';

type AttendanceStatus = 'Present' | 'Half Day' | 'Absent' | 'Leave';

interface CalendarDay {
  id: number;
  attendance_date: string;
  status: AttendanceStatus;
  check_in?: string | null;
  check_out?: string | null;
  site_name?: string | null;
}

interface CalendarResponse {
  employee: {
    id: number;
    first_name: string;
    last_name?: string | null;
    employee_code: string;
    designation_name?: string | null;
    status: string;
    joining_date: string;
  };
  month: string;
  summary: {
    present: number;
    half_day: number;
    absent: number;
    leave: number;
    worked_days: number;
    total_marked: number;
  };
  days: CalendarDay[];
}

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const statusMeta: Record<
  AttendanceStatus,
  {
    cell: string;
    day: string;
    dot: string;
    icon: ComponentProps<typeof Ionicons>['name'];
    iconColor: string;
    iconBackground: string;
  }
> = {
  Present: {
    cell: 'border-emerald-200 bg-emerald-50',
    day: 'text-emerald-800',
    dot: 'bg-emerald-500',
    icon: 'checkmark-circle-outline',
    iconColor: '#059669',
    iconBackground: 'bg-emerald-50',
  },
  'Half Day': {
    cell: 'border-amber-200 bg-amber-50',
    day: 'text-amber-800',
    dot: 'bg-amber-500',
    icon: 'time-outline',
    iconColor: '#d97706',
    iconBackground: 'bg-amber-50',
  },
  Absent: {
    cell: 'border-red-200 bg-red-50',
    day: 'text-red-800',
    dot: 'bg-red-500',
    icon: 'close-circle-outline',
    iconColor: '#dc2626',
    iconBackground: 'bg-red-50',
  },
  Leave: {
    cell: 'border-blue-200 bg-blue-50',
    day: 'text-blue-800',
    dot: 'bg-blue-500',
    icon: 'calendar-outline',
    iconColor: '#2563eb',
    iconBackground: 'bg-blue-50',
  },
};

const localMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const moveMonth = (month: string, amount: number) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
};

const formatTime = (value?: string | null) => {
  if (!value) return 'Not recorded';

  const timeOnly = value.match(/^(\d{2}):(\d{2})/);
  if (timeOnly) {
    const hour = Number(timeOnly[1]);
    const minute = timeOnly[2];
    const suffix = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${minute} ${suffix}`;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
};

export default function EmployeeAttendanceCalendar() {
  const { employeeId: rawEmployeeId } = useLocalSearchParams<{ employeeId?: string | string[] }>();
  const employeeId = Array.isArray(rawEmployeeId) ? rawEmployeeId[0] : rawEmployeeId;
  const validEmployeeId = !!employeeId && /^\d+$/.test(employeeId) && Number(employeeId) > 0;
  const [month, setMonth] = useState(localMonth);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const insets = useSafeAreaInsets();
  const currentMonth = localMonth();

  const { data, error, isError, isLoading, isRefetching, refetch } = useQuery<CalendarResponse>({
    queryKey: ['attendance', 'employee-calendar', employeeId, month],
    queryFn: async () => (
      await api.get(`/attendance/employee/${employeeId}/calendar`, { params: { month } })
    ).data,
    enabled: validEmployeeId,
  });

  const calendar = useMemo(() => {
    const [year, monthNumber] = month.split('-').map(Number);
    const leadingDays = new Date(year, monthNumber - 1, 1).getDay();
    const daysInMonth = new Date(year, monthNumber, 0).getDate();
    const totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7;
    const records = new Map(
      (data?.days ?? []).map((day) => [day.attendance_date.slice(0, 10), day]),
    );

    return Array.from({ length: totalCells }, (_, index) => {
      const dayNumber = index - leadingDays + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) return null;

      const date = `${month}-${String(dayNumber).padStart(2, '0')}`;
      return { dayNumber, date, record: records.get(date) };
    });
  }, [data?.days, month]);

  const showPreviousMonth = () => {
    if (data && month <= data.employee.joining_date.slice(0, 7)) return;
    setSelectedDay(null);
    setMonth((value) => moveMonth(value, -1));
  };

  const showNextMonth = () => {
    if (month >= currentMonth) return;
    setSelectedDay(null);
    setMonth((value) => moveMonth(value, 1));
  };

  if (!validEmployeeId) {
    return (
      <>
        <Stack.Screen options={{ title: 'Work Calendar' }} />
        <Screen error="This employee calendar link is invalid." />
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Work Calendar' }} />
        <Screen className="items-center justify-center">
          <ActivityIndicator color="#2457d6" />
          <Text className="mt-3 text-sm font-medium text-slate-500">Loading attendance calendar…</Text>
        </Screen>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <Stack.Screen options={{ title: 'Work Calendar' }} />
        <Screen error={errorMessage(error)} onRetry={() => void refetch()} />
      </>
    );
  }

  const name = employeeName(data.employee);
  const cannotGoForward = month >= currentMonth;
  const cannotGoBackward = month <= data.employee.joining_date.slice(0, 7);

  return (
    <>
      <Stack.Screen options={{ title: 'Work Calendar' }} />
      <Screen>
        <ScrollView
          className="flex-1 bg-transparent"
          contentContainerClassName="px-4 pb-10 pt-3"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 32, 48) }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        >
          <View style={depth.raised} className="rounded-3xl border border-white/80 bg-white p-4">
            <View className="flex-row items-center">
              <View className="h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
                  <Text className="text-lg font-extrabold text-indigo-700">{employeeInitials(data.employee) || '—'}</Text>
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-lg font-extrabold text-slate-900" numberOfLines={1}>{name}</Text>
                <Text className="mt-0.5 text-xs font-medium text-slate-500" numberOfLines={1}>
                  {data.employee.employee_code} · {data.employee.designation_name || 'No designation'}
                </Text>
              </View>
              <Badge label={data.employee.status} />
            </View>
          </View>

          <View className="mt-4 flex-row gap-3">
            <View style={depth.subtle} className="flex-1 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-white">
                <Ionicons name="briefcase-outline" size={19} color="#059669" />
              </View>
              <Text className="mt-3 text-2xl font-extrabold text-emerald-800">{data.summary.worked_days}</Text>
              <Text className="mt-0.5 text-xs font-semibold text-emerald-700">Days worked</Text>
            </View>
            <View style={depth.subtle} className="flex-1 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-white">
                <Ionicons name="calendar-clear-outline" size={19} color="#4f46e5" />
              </View>
              <Text className="mt-3 text-2xl font-extrabold text-indigo-800">{data.summary.total_marked}</Text>
              <Text className="mt-0.5 text-xs font-semibold text-indigo-700">Days marked</Text>
            </View>
          </View>

          <View style={depth.raised} className="mt-4 rounded-3xl border border-white/90 bg-white px-3 pb-4 pt-3">
            <View className="mb-4 flex-row items-center justify-between px-1">
              <Pressable
                onPress={showPreviousMonth}
                disabled={cannotGoBackward}
                className={`h-12 w-12 items-center justify-center rounded-xl ${
                  cannotGoBackward ? 'bg-slate-50 opacity-40' : 'bg-slate-50 active:bg-slate-100'
                }`}
                accessibilityRole="button"
                accessibilityLabel="Show previous month"
                accessibilityState={{ disabled: cannotGoBackward }}
              >
                <Ionicons name="chevron-back" size={20} color={cannotGoBackward ? '#94a3b8' : '#475569'} />
              </Pressable>
              <View className="items-center">
                <Text className="text-base font-extrabold text-slate-900">{monthLabel(data.month || month)}</Text>
                <Text className="mt-0.5 text-[11px] font-medium text-slate-400">Tap a marked day for details</Text>
              </View>
              <Pressable
                onPress={showNextMonth}
                disabled={cannotGoForward}
                className={`h-12 w-12 items-center justify-center rounded-xl ${
                  cannotGoForward ? 'bg-slate-50 opacity-40' : 'bg-slate-50 active:bg-slate-100'
                }`}
                accessibilityRole="button"
                accessibilityLabel="Show next month"
                accessibilityState={{ disabled: cannotGoForward }}
              >
                <Ionicons name="chevron-forward" size={20} color="#475569" />
              </Pressable>
            </View>

            <View className="mb-1 flex-row">
              {weekDays.map((day, index) => (
                <View key={day} style={{ width: '14.2857%' }} className="items-center py-1.5">
                  <Text className={`text-[11px] font-bold ${index === 0 ? 'text-red-400' : 'text-slate-400'}`}>
                    {day}
                  </Text>
                </View>
              ))}
            </View>

            <View className="flex-row flex-wrap">
              {calendar.map((cell, index) => {
                if (!cell) {
                  return <View key={`empty-${index}`} style={{ width: '14.2857%' }} className="h-12 p-0.5" />;
                }

                const meta = cell.record ? statusMeta[cell.record.status] : null;
                const beforeEmployment = cell.date < data.employee.joining_date;
                return (
                  <View key={cell.date} style={{ width: '14.2857%' }} className="h-12 p-0.5">
                    <Pressable
                      onPress={() => cell.record && setSelectedDay(cell.record)}
                      disabled={!cell.record}
                      className={`flex-1 items-center justify-center rounded-xl border ${
                        meta ? meta.cell : beforeEmployment ? 'border-transparent bg-slate-50' : 'border-transparent bg-white'
                      }`}
                      accessibilityRole={cell.record ? 'button' : undefined}
                      accessibilityLabel={cell.record
                        ? `${formatDate(cell.date)}, ${cell.record.status}`
                        : `${formatDate(cell.date)}, ${beforeEmployment ? 'before employment' : 'no attendance recorded'}`}
                      accessibilityHint={cell.record ? 'Shows attendance details' : undefined}
                      accessibilityState={{ disabled: !cell.record }}
                    >
                      <Text className={`text-sm font-bold ${meta ? meta.day : beforeEmployment ? 'text-slate-300' : 'text-slate-600'}`}>
                        {cell.dayNumber}
                      </Text>
                      {meta ? <View className={`mt-1 h-1.5 w-1.5 rounded-full ${meta.dot}`} /> : null}
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <View className="mx-1 mt-4 border-t border-slate-100 pt-3">
              <View className="flex-row flex-wrap">
                {(Object.keys(statusMeta) as AttendanceStatus[]).map((status) => {
                  const count = status === 'Present'
                    ? data.summary.present
                    : status === 'Half Day'
                      ? data.summary.half_day
                      : status === 'Absent'
                        ? data.summary.absent
                        : data.summary.leave;
                  return (
                    <View key={status} className="mb-2 w-1/2 flex-row items-center px-1">
                      <View className={`h-2.5 w-2.5 rounded-full ${statusMeta[status].dot}`} />
                      <Text className="ml-2 text-xs font-medium text-slate-600">{status}</Text>
                      <Text className="ml-1 text-xs font-bold text-slate-900">{count}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        </ScrollView>
      </Screen>

      <Modal
        visible={selectedDay !== null}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setSelectedDay(null)}
      >
        <View className="flex-1 justify-end">
          <Pressable
            className="absolute inset-0 bg-slate-950/45"
            onPress={() => setSelectedDay(null)}
            accessibilityRole="button"
            accessibilityLabel="Close attendance details"
          />
          <View
            accessibilityViewIsModal
            className="rounded-t-3xl border border-white/80 bg-white"
            style={[depth.chrome, { maxHeight: '85%', paddingBottom: Math.max(insets.bottom, 16) }]}
          >
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerClassName="px-4 pt-3"
            >
            <View className="mb-3 h-1 w-10 self-center rounded-full bg-slate-300" />
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-lg font-extrabold text-slate-900">Attendance details</Text>
                <Text className="mt-0.5 text-sm font-medium text-slate-500">
                  {formatDate(selectedDay?.attendance_date)}
                </Text>
              </View>
              <Pressable
                onPress={() => setSelectedDay(null)}
                className="h-12 w-12 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200"
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color="#475569" />
              </Pressable>
            </View>

            {selectedDay ? (
              <>
                <View className="mt-4 flex-row items-center rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <View className={`h-11 w-11 items-center justify-center rounded-xl ${statusMeta[selectedDay.status].iconBackground}`}>
                    <Ionicons
                      name={statusMeta[selectedDay.status].icon}
                      size={23}
                      color={statusMeta[selectedDay.status].iconColor}
                    />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-xs font-medium text-slate-500">Status</Text>
                    <Text className="mt-0.5 text-base font-extrabold text-slate-900">{selectedDay.status}</Text>
                  </View>
                </View>

                <View className="mt-3 overflow-hidden rounded-2xl border border-slate-100 bg-white">
                  <DetailRow icon="business-outline" label="Site" value={selectedDay.site_name || 'Not assigned'} />
                  <View className="h-px bg-slate-100" />
                  <DetailRow icon="log-in-outline" label="Check-in" value={formatTime(selectedDay.check_in)} />
                  <View className="h-px bg-slate-100" />
                  <DetailRow icon="log-out-outline" label="Check-out" value={formatTime(selectedDay.check_out)} />
                </View>
              </>
            ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View className="min-h-14 flex-row items-center px-3 py-2.5">
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-slate-50">
        <Ionicons name={icon} size={18} color="#64748b" />
      </View>
      <Text className="ml-3 flex-1 text-sm font-medium text-slate-500">{label}</Text>
      <Text className="max-w-[50%] text-right text-sm font-bold text-slate-800" numberOfLines={2}>{value}</Text>
    </View>
  );
}
