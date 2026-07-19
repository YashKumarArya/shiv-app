import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api, errorMessage, fileUrl } from '@/api/client';
import {
  employeeInitials,
  employeeName,
  type SalaryTrackingEmployee,
  type SalaryTrackingResponse,
} from '@/api/types';
import { SalaryHeroArtwork } from '@/components/SalaryHeroArtwork';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchBar } from '@/components/ui/SearchBar';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';
import { formatCurrency, monthName } from '@/lib/format';
import { notify } from '@/lib/notify';
import { invalidateQueryRoots } from '@/lib/queryInvalidation';
import { useAuth } from '@/providers/AuthProvider';

type SalaryStatus = 'Paid' | 'Partial' | 'Due' | 'Advance' | 'No Earnings' | 'Not Set';
type StatusFilter = 'All' | SalaryStatus;
type IconName = ComponentProps<typeof Ionicons>['name'];

const filters: StatusFilter[] = ['All', 'Due', 'Partial', 'Paid', 'Advance', 'No Earnings', 'Not Set'];

const statusMeta: Record<SalaryStatus, {
  label: string;
  icon: IconName;
  chip: string;
  text: string;
  avatar: string;
  iconColor: string;
}> = {
  Paid: {
    label: 'Paid', icon: 'checkmark-circle', chip: 'bg-emerald-50', text: 'text-emerald-700',
    avatar: 'bg-emerald-50', iconColor: '#059669',
  },
  Partial: {
    label: 'Partial', icon: 'pie-chart', chip: 'bg-violet-50', text: 'text-violet-700',
    avatar: 'bg-violet-50', iconColor: '#7c3aed',
  },
  Due: {
    label: 'Due', icon: 'time', chip: 'bg-amber-50', text: 'text-amber-700',
    avatar: 'bg-amber-50', iconColor: '#d97706',
  },
  Advance: {
    label: 'Advance paid', icon: 'trending-up', chip: 'bg-sky-50', text: 'text-sky-700',
    avatar: 'bg-sky-50', iconColor: '#0284c7',
  },
  'No Earnings': {
    label: 'No earnings', icon: 'remove-circle', chip: 'bg-slate-100', text: 'text-slate-600',
    avatar: 'bg-slate-100', iconColor: '#64748b',
  },
  'Not Set': {
    label: 'Salary not set', icon: 'alert-circle', chip: 'bg-rose-50', text: 'text-rose-700',
    avatar: 'bg-rose-50', iconColor: '#e11d48',
  },
};

const displayStatus = (employee: SalaryTrackingEmployee): SalaryStatus =>
  !employee.has_earnings && Number(employee.paid_amount ?? 0) <= 0 && employee.status !== 'Not Set'
    ? 'No Earnings'
    : employee.status;

const previousMonth = (month: number, year: number) =>
  month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };

const followingMonth = (month: number, year: number) =>
  month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };

const Metric = ({ label, value, accent }: { label: string; value: string; accent: string }) => (
  <View className="flex-1 rounded-2xl bg-white/10 px-3 py-3">
    <Text className="text-[11px] font-bold uppercase tracking-[0.8px] text-indigo-100">{label}</Text>
    <Text
      className={`mt-1 text-base font-extrabold ${accent}`}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
    >
      {value}
    </Text>
  </View>
);

export default function SalaryTracking() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { employee_id: employeeId } = useLocalSearchParams<{ employee_id?: string }>();
  const current = new Date();
  const [period, setPeriod] = useState({ month: current.getMonth() + 1, year: current.getFullYear() });
  const [filter, setFilter] = useState<StatusFilter>('All');
  const [search, setSearch] = useState('');

  const { data, error, isError, isLoading, isRefetching, refetch } = useQuery<SalaryTrackingResponse>({
    queryKey: ['payments', 'tracking', period.year, period.month, employeeId],
    queryFn: async () => (
      await api.get('/payments/tracking', {
        params: { month: period.month, year: period.year, employee_id: employeeId || undefined },
      })
    ).data,
  });

  const isCurrentMonth = period.month === current.getMonth() + 1 && period.year === current.getFullYear();
  const employees = data?.employees ?? [];
  const scopedEmployees = useMemo(
    () => employeeId ? employees.filter((employee) => String(employee.employee_id) === employeeId) : employees,
    [employeeId, employees],
  );
  const salarySummary = useMemo(() => {
    return scopedEmployees.reduce((summary, employee) => {
      summary.total_payroll += Number(employee.due_amount ?? 0);
      summary.total_paid += Number(employee.paid_amount ?? 0);
      summary.total_remaining += Number(employee.remaining_amount ?? 0);
      summary.total_advance += Number(employee.advance_amount ?? 0);
      const status = displayStatus(employee);
      if (status === 'Paid') summary.paid_count += 1;
      if (status === 'Partial') summary.partial_count += 1;
      if (status === 'Due') summary.due_count += 1;
      if (status === 'Advance') summary.advance_count += 1;
      if (status === 'No Earnings') summary.no_earnings_count += 1;
      if (status === 'Not Set') summary.not_set_count += 1;
      return summary;
    }, {
      total_payroll: 0, total_paid: 0, total_remaining: 0, total_advance: 0,
      paid_count: 0, partial_count: 0, due_count: 0, advance_count: 0, no_earnings_count: 0, not_set_count: 0,
    });
  }, [scopedEmployees]);
  const statusCounts: Record<StatusFilter, number> = {
    All: scopedEmployees.length,
    Paid: salarySummary.paid_count,
    Partial: salarySummary.partial_count,
    Due: salarySummary.due_count,
    Advance: salarySummary.advance_count,
    'No Earnings': salarySummary.no_earnings_count,
    'Not Set': salarySummary.not_set_count,
  };

  const visibleEmployees = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return scopedEmployees.filter((employee) => {
      if (filter !== 'All' && displayStatus(employee) !== filter) return false;
      if (!term) return true;
      return [employeeName(employee), employee.employee_code, employee.designation_name]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(term));
    });
  }, [filter, scopedEmployees, search]);

  const finalizePayroll = useMutation({
    mutationFn: () => api.post('/payments/tracking/finalize', {
      month: period.month,
      year: period.year,
      employee_id: employeeId ? Number(employeeId) : undefined,
    }),
    onSuccess: async () => {
      await invalidateQueryRoots(queryClient, ['payments', 'dashboard']);
      notify('Payroll finalized', `${monthName(period.month)} ${period.year} now uses an immutable payroll snapshot.`);
    },
    onError: (mutationError) => notify('Couldn’t finalize payroll', errorMessage(mutationError)),
  });

  const confirmFinalize = () => {
    const proceed = () => finalizePayroll.mutate();
    const message = data?.payroll_finalized
      ? `Approve the existing immutable snapshot for ${monthName(period.month)} ${period.year}? This authorizes historical payment entries against it.`
      : `Finalize ${monthName(period.month)} ${period.year}? Salary, designation, settings, attendance days, and earned payroll will be permanently snapshotted. Later attendance or salary edits will not change this payroll period.`;
    if (Platform.OS === 'web') {
      if (globalThis.confirm(message)) proceed();
      return;
    }
    Alert.alert('Finalize payroll?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Finalize', style: 'destructive', onPress: proceed },
    ]);
  };

  const openEmployee = (employee: SalaryTrackingEmployee) => {
    if (employee.status === 'Not Set') {
      router.push(`/employees/form?id=${employee.employee_id}` as Href);
      return;
    }

    const params = new URLSearchParams({
      employee_id: String(employee.employee_id),
      payment_month: String(period.month),
      payment_year: String(period.year),
    });
    router.push(`/payments/history?${params.toString()}` as Href);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Salary Tracker' }} />
      <ScrollView
        className="flex-1 bg-transparent"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 24, 48) }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2457d6" />}
      >
        <View className="mx-4 mt-4 flex-row items-center justify-between">
          <Pressable
            onPress={() => setPeriod(previousMonth(period.month, period.year))}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            className="h-12 w-12 items-center justify-center rounded-2xl border border-white/80 bg-white active:bg-slate-50"
            style={depth.subtle}
          >
            <Ionicons name="chevron-back" size={20} color="#334155" />
          </Pressable>

          <View className="flex-1 items-center px-2">
            <Text className="text-lg font-extrabold text-brand-900">{monthName(period.month)} {period.year}</Text>
            <Text className="mt-0.5 text-center text-xs font-semibold text-slate-500" numberOfLines={2}>
              {(data?.estimated_snapshot_count ?? 0) > 0
                ? 'Frozen legacy estimate — pre-migration salary history was unavailable'
                : data?.payroll_approved
                  ? 'Admin-approved immutable payroll snapshot'
                  : data?.payroll_finalized
                    ? 'Immutable snapshot awaiting admin approval'
                : isCurrentMonth
                  ? 'Live payroll — attendance and salary changes still apply'
                  : 'Unfinalized estimate — current salary and settings still apply'}
            </Text>
          </View>

          <Pressable
            onPress={() => !isCurrentMonth && setPeriod(followingMonth(period.month, period.year))}
            disabled={isCurrentMonth}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            accessibilityState={{ disabled: isCurrentMonth }}
            className={`h-12 w-12 items-center justify-center rounded-2xl border border-white/80 ${
              isCurrentMonth ? 'bg-white/50' : 'bg-white active:bg-slate-50'
            }`}
            style={depth.subtle}
          >
            <Ionicons name="chevron-forward" size={20} color={isCurrentMonth ? '#cbd5e1' : '#334155'} />
          </Pressable>
        </View>

        {user?.role === 'admin' && data && !data.payroll_approved && !isLoading ? (
          <View className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <View className="flex-row items-center">
              <Ionicons name="warning-outline" size={18} color="#b45309" />
              <Text className="ml-2 flex-1 text-xs font-semibold leading-4 text-amber-800">
                {data.payroll_finalized
                  ? 'This immutable snapshot still needs administrator approval.'
                  : 'Finalizing locks this period’s payroll basis permanently.'}
              </Text>
              <Pressable
                onPress={confirmFinalize}
                disabled={finalizePayroll.isPending}
                accessibilityRole="button"
                accessibilityLabel={`Finalize payroll for ${monthName(period.month)} ${period.year}`}
                className="min-h-10 justify-center rounded-xl bg-amber-600 px-3 active:bg-amber-700"
              >
                {finalizePayroll.isPending ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-xs font-extrabold text-white">Finalize</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        {isLoading ? (
          <View className="items-center pt-24">
            <ActivityIndicator color="#2457d6" />
            <Text className="mt-3 text-sm font-medium text-slate-500">Loading salary details…</Text>
          </View>
        ) : isError ? (
          <EmptyState
            title="Couldn’t load salary details"
            message={errorMessage(error)}
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
        ) : (
          <>
            <View style={[depth.raised, styles.heroShadow]}>
              <View collapsable={false} style={styles.heroSurface}>
                <LinearGradient
                  pointerEvents="none"
                  colors={['#312e81', '#5b21b6', '#7c3aed']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <SalaryHeroArtwork />
                <View style={styles.heroContent}>
                  <View className="flex-row items-center justify-between">
                    <View className="h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                      <Ionicons name="wallet" size={20} color="#fef3c7" />
                    </View>
                    <View className="rounded-full bg-white/10 px-3 py-1.5">
                      <Text className="text-xs font-bold text-white">
                        {salarySummary.due_count} due · {salarySummary.partial_count} partial
                      </Text>
                    </View>
                  </View>

                  <Text className="mt-5 text-xs font-bold uppercase tracking-[1px] text-indigo-200">Remaining to pay</Text>
                  <Text
                    className="mt-1 text-[34px] font-extrabold tracking-tight text-white"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                  >
                    {formatCurrency(salarySummary.total_remaining)}
                  </Text>

                  <View className="mt-5 flex-row gap-3">
                    <Metric label="Paid" value={formatCurrency(salarySummary.total_paid)} accent="text-emerald-300" />
                    <Metric label="Payroll" value={formatCurrency(salarySummary.total_payroll)} accent="text-white" />
                  </View>
                </View>
              </View>
            </View>

            <SearchBar value={search} onChange={setSearch} placeholder="Search employee or code" />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2 px-4 py-3"
            >
              {filters.map((status) => {
                const selected = filter === status;
                return (
                  <Pressable
                    key={status}
                    onPress={() => setFilter(status)}
                    accessibilityRole="button"
                    accessibilityLabel={`${status}, ${statusCounts[status]}`}
                    accessibilityState={{ selected }}
                    className={`min-h-12 flex-row items-center justify-center rounded-full border px-4 ${
                      selected ? 'border-violet-600 bg-violet-600' : 'border-white/80 bg-white'
                    }`}
                    style={!selected ? depth.subtle : undefined}
                  >
                    <Text className={`text-xs font-bold ${selected ? 'text-white' : 'text-slate-600'}`}>
                      {status}
                    </Text>
                    <View className={`ml-2 rounded-full px-2 py-0.5 ${selected ? 'bg-white/20' : 'bg-slate-100'}`}>
                      <Text className={`text-[11px] font-extrabold ${selected ? 'text-white' : 'text-slate-500'}`}>
                        {statusCounts[status]}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {!scopedEmployees.length ? (
              <EmptyState
                title="No employees for this month"
                message="Active employees and their salary status will appear here."
                icon="people-outline"
              />
            ) : !visibleEmployees.length ? (
              <EmptyState
                title="No matching employees"
                message="Try a different name, employee code, or payment status."
                icon="search-outline"
              />
            ) : (
              <View style={depth.raised} className="mx-4 rounded-3xl">
                <View className="overflow-hidden rounded-3xl border border-white/80 bg-white">
                  <View className="border-b border-slate-100 px-4 py-3.5">
                    <Text className="text-base font-extrabold text-slate-900">Team salaries</Text>
                    <Text className="mt-0.5 text-xs font-medium text-slate-500">
                      {visibleEmployees.length} {visibleEmployees.length === 1 ? 'employee' : 'employees'} shown
                    </Text>
                  </View>

                  {visibleEmployees.map((employee, index) => {
                    const status = displayStatus(employee);
                    const meta = statusMeta[status];
                    const paid = Number(employee.paid_amount ?? 0);
                    const earned = Number(employee.due_amount ?? 0);
                    const progress = earned > 0 ? Math.min(100, Math.max(0, (paid / earned) * 100)) : 0;
                    return (
                      <Pressable
                        key={employee.employee_id}
                        onPress={() => openEmployee(employee)}
                        accessibilityRole="button"
                        accessibilityLabel={`${employeeName(employee)}, ${meta.label}, ${formatCurrency(employee.paid_amount)} paid of ${formatCurrency(employee.due_amount)} earned`}
                        accessibilityHint={status === 'Not Set' ? 'Opens employee salary setup' : 'Opens payment history and installment actions'}
                        className={`p-4 active:bg-slate-50 ${index < visibleEmployees.length - 1 ? 'border-b border-slate-100' : ''}`}
                      >
                        <View className="flex-row items-center">
                          <View
                            className={`h-12 w-12 items-center justify-center overflow-hidden rounded-2xl ${
                              employee.photo ? 'bg-slate-100' : meta.avatar
                            }`}
                          >
                            {employee.photo ? (
                              <Image
                                source={{ uri: fileUrl(employee.photo) }}
                                resizeMode="cover"
                                style={StyleSheet.absoluteFillObject}
                                accessibilityLabel={`${employeeName(employee)} profile photo`}
                              />
                            ) : (
                              <Text className="text-sm font-extrabold text-slate-700">{employeeInitials(employee)}</Text>
                            )}
                          </View>

                          <View className="ml-3 flex-1 pr-2">
                            <Text className="text-[15px] font-extrabold text-slate-900" numberOfLines={1}>
                              {employeeName(employee)}
                            </Text>
                            <Text className="mt-0.5 text-xs font-medium text-slate-500" numberOfLines={1}>
                              {[employee.employee_code, employee.designation_name].filter(Boolean).join(' · ')}
                            </Text>
                          </View>

                          <View className={`flex-row items-center rounded-full px-2.5 py-1.5 ${meta.chip}`}>
                            <Ionicons name={meta.icon} size={13} color={meta.iconColor} />
                            <Text className={`ml-1 text-[11px] font-extrabold ${meta.text}`}>{meta.label}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color="#b0bccb" style={{ marginLeft: 7 }} />
                        </View>

                        {status === 'Not Set' ? (
                          <View className="ml-[60px] mt-3 flex-row items-center rounded-xl bg-rose-50 px-3 py-2.5">
                            <Ionicons name="information-circle-outline" size={17} color="#e11d48" />
                            <Text className="ml-2 flex-1 text-xs font-bold text-rose-700">Set a monthly salary to start tracking</Text>
                          </View>
                        ) : (
                          <View className="ml-[60px] mt-3">
                            <View className="flex-row items-end justify-between">
                              <View>
                                <Text className="text-[11px] font-semibold text-slate-400">
                                  PAID / EARNED · {employee.payment_count ?? 0} {(employee.payment_count ?? 0) === 1 ? 'PAYMENT' : 'PAYMENTS'}
                                </Text>
                                <Text className="mt-0.5 text-sm font-extrabold text-slate-800">
                                  {formatCurrency(employee.paid_amount)} <Text className="font-semibold text-slate-400">/ {formatCurrency(employee.due_amount)}</Text>
                                </Text>
                              </View>
                              <View className="items-end">
                                <Text className="text-[11px] font-semibold text-slate-400">
                                  {employee.advance_amount > 0 ? 'ADVANCE PAID' : 'REMAINING'}
                                </Text>
                                <Text
                                  className={`mt-0.5 text-sm font-extrabold ${
                                    employee.advance_amount > 0
                                      ? 'text-sky-600'
                                      : employee.remaining_amount > 0
                                        ? 'text-amber-600'
                                        : 'text-emerald-600'
                                  }`}
                                >
                                  {formatCurrency(employee.advance_amount > 0 ? employee.advance_amount : employee.remaining_amount)}
                                </Text>
                              </View>
                            </View>
                            <View className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <View
                                className={`h-full rounded-full ${
                                  status === 'Paid' ? 'bg-emerald-500' : status === 'Advance' ? 'bg-sky-500' : 'bg-violet-500'
                                }`}
                                style={{ width: `${progress}%` }}
                              />
                            </View>
                            <Text className="mt-1.5 text-[11px] font-medium text-slate-400">
                              Worked {employee.worked_days} of {employee.payable_days} payable days ·{' '}
                              {formatCurrency(employee.per_day_rate)}/day
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroShadow: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 28,
    backgroundColor: '#312e81',
  },
  heroSurface: {
    position: 'relative',
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#312e81',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  heroContent: {
    position: 'relative',
    zIndex: 2,
    padding: 20,
  },
});
