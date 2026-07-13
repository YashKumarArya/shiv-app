import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api, errorMessage } from '@/api/client';
import { SalaryHeroArtwork } from '@/components/SalaryHeroArtwork';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchBar } from '@/components/ui/SearchBar';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';
import { monthName } from '@/lib/format';

type SalaryStatus = 'Paid' | 'Partial' | 'Due' | 'Not Set';
type StatusFilter = 'All' | SalaryStatus;
type IconName = ComponentProps<typeof Ionicons>['name'];

interface SalaryEmployee {
  employee_id: number;
  employee_code: string;
  first_name: string;
  last_name?: string | null;
  designation_name?: string | null;
  effective_salary: number;
  due_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: SalaryStatus;
  payment_count: number;
  payment?: {
    id: number;
    payment_date?: string | null;
    payment_mode?: string | null;
  } | null;
}

interface SalaryTrackingResponse {
  month: number;
  year: number;
  summary: {
    total_payroll: number;
    total_paid: number;
    total_remaining: number;
    paid_count: number;
    partial_count: number;
    due_count: number;
    not_set_count: number;
  };
  employees: SalaryEmployee[];
}

const filters: StatusFilter[] = ['All', 'Due', 'Partial', 'Paid', 'Not Set'];

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
  'Not Set': {
    label: 'Salary not set', icon: 'alert-circle', chip: 'bg-rose-50', text: 'text-rose-700',
    avatar: 'bg-rose-50', iconColor: '#e11d48',
  },
};

const amount = (value: number | string | null | undefined) => {
  const numericValue = Number(value ?? 0);
  return `₹${new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numericValue) ? numericValue : 0)}`;
};

const employeeName = (employee: SalaryEmployee) =>
  [employee.first_name, employee.last_name].filter(Boolean).join(' ');

const employeeInitials = (employee: SalaryEmployee) =>
  [employee.first_name, employee.last_name]
    .filter(Boolean)
    .map((part) => part![0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

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
    if (!employeeId) return data?.summary ?? {
      total_payroll: 0, total_paid: 0, total_remaining: 0,
      paid_count: 0, partial_count: 0, due_count: 0, not_set_count: 0,
    };
    return scopedEmployees.reduce((summary, employee) => {
      summary.total_payroll += Number(employee.due_amount ?? 0);
      summary.total_paid += Number(employee.paid_amount ?? 0);
      summary.total_remaining += Number(employee.remaining_amount ?? 0);
      if (employee.status === 'Paid') summary.paid_count += 1;
      if (employee.status === 'Partial') summary.partial_count += 1;
      if (employee.status === 'Due') summary.due_count += 1;
      if (employee.status === 'Not Set') summary.not_set_count += 1;
      return summary;
    }, {
      total_payroll: 0, total_paid: 0, total_remaining: 0,
      paid_count: 0, partial_count: 0, due_count: 0, not_set_count: 0,
    });
  }, [data?.summary, employeeId, scopedEmployees]);
  const statusCounts: Record<StatusFilter, number> = {
    All: scopedEmployees.length,
    Paid: salarySummary.paid_count,
    Partial: salarySummary.partial_count,
    Due: salarySummary.due_count,
    'Not Set': salarySummary.not_set_count,
  };

  const visibleEmployees = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return scopedEmployees.filter((employee) => {
      if (filter !== 'All' && employee.status !== filter) return false;
      if (!term) return true;
      return [employeeName(employee), employee.employee_code, employee.designation_name]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(term));
    });
  }, [filter, scopedEmployees, search]);

  const openEmployee = (employee: SalaryEmployee) => {
    if (employee.status === 'Not Set') {
      router.push(`/employees/form?id=${employee.employee_id}` as Href);
      return;
    }

    const params = new URLSearchParams({
      employee_id: String(employee.employee_id),
      employee_name: employeeName(employee),
      payment_month: String(period.month),
      payment_year: String(period.year),
      payroll: String(employee.due_amount),
      paid: String(employee.paid_amount),
      remaining: String(employee.remaining_amount),
    });
    router.push(`/payments/history?${params.toString()}` as Href);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Salary Tracker' }} />
      <ScrollView
        className="flex-1 bg-transparent"
        contentContainerClassName="pb-12"
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
              {isCurrentMonth ? 'Current team salary overview' : 'Calculated using current salary settings'}
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
                    {amount(salarySummary.total_remaining)}
                  </Text>

                  <View className="mt-5 flex-row gap-3">
                    <Metric label="Paid" value={amount(salarySummary.total_paid)} accent="text-emerald-300" />
                    <Metric label="Payroll" value={amount(salarySummary.total_payroll)} accent="text-white" />
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
                    const meta = statusMeta[employee.status];
                    const paid = Number(employee.paid_amount ?? 0);
                    const salary = Number(employee.effective_salary ?? employee.due_amount ?? 0);
                    const progress = salary > 0 ? Math.min(100, Math.max(0, (paid / salary) * 100)) : 0;
                    return (
                      <Pressable
                        key={employee.employee_id}
                        onPress={() => openEmployee(employee)}
                        accessibilityRole="button"
                        accessibilityLabel={`${employeeName(employee)}, ${meta.label}, ${amount(employee.paid_amount)} paid of ${amount(employee.effective_salary)}`}
                        accessibilityHint={employee.status === 'Not Set' ? 'Opens employee salary setup' : 'Opens payment history and installment actions'}
                        className={`p-4 active:bg-slate-50 ${index < visibleEmployees.length - 1 ? 'border-b border-slate-100' : ''}`}
                      >
                        <View className="flex-row items-center">
                          <View className={`h-12 w-12 items-center justify-center rounded-2xl ${meta.avatar}`}>
                            <Text className="text-sm font-extrabold text-slate-700">{employeeInitials(employee)}</Text>
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

                        {employee.status === 'Not Set' ? (
                          <View className="ml-[60px] mt-3 flex-row items-center rounded-xl bg-rose-50 px-3 py-2.5">
                            <Ionicons name="information-circle-outline" size={17} color="#e11d48" />
                            <Text className="ml-2 flex-1 text-xs font-bold text-rose-700">Set a monthly salary to start tracking</Text>
                          </View>
                        ) : (
                          <View className="ml-[60px] mt-3">
                            <View className="flex-row items-end justify-between">
                              <View>
                                <Text className="text-[11px] font-semibold text-slate-400">
                                  PAID / SALARY · {employee.payment_count ?? 0} {(employee.payment_count ?? 0) === 1 ? 'PAYMENT' : 'PAYMENTS'}
                                </Text>
                                <Text className="mt-0.5 text-sm font-extrabold text-slate-800">
                                  {amount(employee.paid_amount)} <Text className="font-semibold text-slate-400">/ {amount(employee.effective_salary)}</Text>
                                </Text>
                              </View>
                              <View className="items-end">
                                <Text className="text-[11px] font-semibold text-slate-400">REMAINING</Text>
                                <Text className={`mt-0.5 text-sm font-extrabold ${employee.remaining_amount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                  {amount(employee.remaining_amount)}
                                </Text>
                              </View>
                            </View>
                            <View className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <View
                                className={`h-full rounded-full ${employee.status === 'Paid' ? 'bg-emerald-500' : 'bg-violet-500'}`}
                                style={{ width: `${progress}%` }}
                              />
                            </View>
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
