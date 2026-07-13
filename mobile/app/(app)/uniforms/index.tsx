import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchBar } from '@/components/ui/SearchBar';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';
import { confirmAction } from '@/lib/confirm';
import { formatDate, today } from '@/lib/format';
import { notify } from '@/lib/notify';

type UniformStatus = 'Issued' | 'Not Issued';
type StatusFilter = 'All' | UniformStatus;
type IconName = ComponentProps<typeof Ionicons>['name'];

interface UniformEmployee {
  employee_id: number;
  employee_code: string;
  first_name: string;
  last_name?: string | null;
  designation_name?: string | null;
  status: UniformStatus;
  issue_id?: number;
  issued_date?: string | null;
  uniform_size?: string | null;
  remarks?: string | null;
}

interface UniformTrackingResponse {
  summary: { total: number; issued: number; not_issued: number };
  employees: UniformEmployee[];
}

const filters: StatusFilter[] = ['All', 'Issued', 'Not Issued'];

const nameOf = (employee: UniformEmployee) =>
  [employee.first_name, employee.last_name].filter(Boolean).join(' ');

const initialsOf = (employee: UniformEmployee) =>
  [employee.first_name, employee.last_name]
    .filter(Boolean)
    .map((part) => part![0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const SummaryMetric = ({ icon, label, value, color }: {
  icon: IconName;
  label: string;
  value: number;
  color: string;
}) => (
  <View className="flex-1 items-center rounded-2xl bg-white/10 px-2 py-3">
    <Ionicons name={icon} size={18} color={color} />
    <Text className="mt-1.5 text-xl font-extrabold text-white">{value}</Text>
    <Text className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.6px] text-violet-100">{label}</Text>
  </View>
);

export default function UniformTracker() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { employee_id: employeeId } = useLocalSearchParams<{ employee_id?: string }>();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('All');

  const { data, error, isError, isLoading, isRefetching, refetch } = useQuery<UniformTrackingResponse>({
    queryKey: ['uniforms', 'tracking', employeeId],
    queryFn: async () => (
      await api.get('/uniforms/tracking', { params: { employee_id: employeeId || undefined } })
    ).data,
  });

  const returnUniform = useMutation({
    mutationFn: (issueId: number) => api.put(`/uniforms/${issueId}`, {
      returned: true,
      returned_date: today(),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['uniforms'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (mutationError) => notify('Couldn’t return uniform', errorMessage(mutationError)),
  });

  const scopedEmployees = useMemo(
    () => (data?.employees ?? []).filter(
      (employee) => !employeeId || String(employee.employee_id) === employeeId,
    ),
    [data?.employees, employeeId],
  );

  const summary = useMemo(() => {
    if (!employeeId && data?.summary) return data.summary;
    const issued = scopedEmployees.filter((employee) => employee.status === 'Issued').length;
    return { total: scopedEmployees.length, issued, not_issued: scopedEmployees.length - issued };
  }, [data?.summary, employeeId, scopedEmployees]);

  const visibleEmployees = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return scopedEmployees.filter((employee) => {
      if (filter !== 'All' && employee.status !== filter) return false;
      if (!term) return true;
      return [nameOf(employee), employee.employee_code, employee.designation_name]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(term));
    });
  }, [filter, scopedEmployees, search]);

  const statusCounts: Record<StatusFilter, number> = {
    All: summary.total,
    Issued: summary.issued,
    'Not Issued': summary.not_issued,
  };

  const openEmployee = (employee: UniformEmployee) => {
    if (employee.status === 'Not Issued') {
      router.push(`/uniforms/form?employee_id=${employee.employee_id}` as Href);
      return;
    }

    if (!employee.issue_id || returnUniform.isPending) return;
    confirmAction({
      title: 'Mark uniform returned?',
      message: `${nameOf(employee)}’s ${employee.uniform_size ? `size ${employee.uniform_size} ` : ''}uniform will be marked as returned today.`,
      confirmText: 'Mark Returned',
      onConfirm: () => returnUniform.mutate(employee.issue_id!),
    });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Uniform Tracker' }} />
      <ScrollView
        className="flex-1 bg-transparent"
        contentContainerClassName="pb-12"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#7c3aed" />}
      >
        {isLoading ? (
          <View className="items-center pt-24">
            <ActivityIndicator color="#7c3aed" />
            <Text className="mt-3 text-sm font-medium text-slate-500">Loading uniform status…</Text>
          </View>
        ) : isError ? (
          <EmptyState
            title="Couldn’t load uniforms"
            message={errorMessage(error)}
            icon="cloud-offline-outline"
            action={(
              <Pressable
                onPress={() => refetch()}
                accessibilityRole="button"
                className="min-h-12 justify-center rounded-xl bg-violet-50 px-5"
              >
                <Text className="font-bold text-violet-700">Try again</Text>
              </Pressable>
            )}
          />
        ) : (
          <>
            <View style={[depth.hero, styles.heroShadow]}>
              <View style={styles.heroClip}>
                <LinearGradient
                  colors={['#6d28d9', '#9333ea', '#db2777']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroGradient}
                >
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text className="text-xs font-bold uppercase tracking-[1px] text-violet-100">Team kit overview</Text>
                      <Text className="mt-1 text-xl font-extrabold text-white">Uniform status</Text>
                    </View>
                    <View className="h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                      <Ionicons name="shirt" size={23} color="#ffffff" />
                    </View>
                  </View>

                  <View className="mt-5 flex-row gap-2.5">
                    <SummaryMetric icon="people" label="Total" value={summary.total} color="#ddd6fe" />
                    <SummaryMetric icon="checkmark-circle" label="Issued" value={summary.issued} color="#86efac" />
                    <SummaryMetric icon="alert-circle" label="Not issued" value={summary.not_issued} color="#fde68a" />
                  </View>
                </LinearGradient>
              </View>
            </View>

            <SearchBar value={search} onChange={setSearch} placeholder="Search employee, code or role" />

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
                    <Text className={`text-xs font-bold ${selected ? 'text-white' : 'text-slate-600'}`}>{status}</Text>
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
                title="No employees to track"
                message="Employees will appear here when their uniform status can be tracked."
                icon="people-outline"
              />
            ) : !visibleEmployees.length ? (
              <EmptyState
                title="No matching employees"
                message="Try a different search or uniform status."
                icon="search-outline"
              />
            ) : (
              <View style={depth.raised} className="mx-4 rounded-3xl">
                <View className="overflow-hidden rounded-3xl border border-white/80 bg-white">
                  <View className="border-b border-slate-100 px-4 py-3.5">
                    <Text className="text-base font-extrabold text-slate-900">Employees</Text>
                    <Text className="mt-0.5 text-xs font-medium text-slate-500">
                      Tap an issued uniform to return it, or issue one where missing
                    </Text>
                  </View>

                  {visibleEmployees.map((employee, index) => {
                    const issued = employee.status === 'Issued';
                    const pending = returnUniform.isPending && returnUniform.variables === employee.issue_id;
                    return (
                      <Pressable
                        key={employee.employee_id}
                        onPress={() => openEmployee(employee)}
                        disabled={pending}
                        accessibilityRole="button"
                        accessibilityLabel={`${nameOf(employee)}, ${employee.employee_code}, uniform ${employee.status}${issued ? `, size ${employee.uniform_size ?? 'not recorded'}, issued ${formatDate(employee.issued_date)}` : ''}`}
                        accessibilityHint={issued ? 'Asks to confirm this uniform was returned' : 'Opens the uniform issue form'}
                        accessibilityState={{ disabled: pending, busy: pending }}
                        className={`min-h-[88px] flex-row items-center p-4 active:bg-slate-50 ${
                          index < visibleEmployees.length - 1 ? 'border-b border-slate-100' : ''
                        }`}
                      >
                        <View className={`h-12 w-12 items-center justify-center rounded-2xl ${issued ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                          {pending ? (
                            <ActivityIndicator size="small" color="#7c3aed" />
                          ) : (
                            <Text className={`text-sm font-extrabold ${issued ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {initialsOf(employee)}
                            </Text>
                          )}
                        </View>

                        <View className="ml-3 flex-1 pr-2">
                          <Text className="text-[15px] font-extrabold text-slate-900" numberOfLines={1}>
                            {nameOf(employee)}
                          </Text>
                          <Text className="mt-0.5 text-xs font-medium text-slate-500" numberOfLines={1}>
                            {[employee.employee_code, employee.designation_name].filter(Boolean).join(' · ')}
                          </Text>
                          {issued ? (
                            <View className="mt-2 flex-row items-center">
                              <View className="rounded-lg bg-slate-100 px-2 py-1">
                                <Text className="text-[11px] font-extrabold text-slate-700">Size {employee.uniform_size ?? '—'}</Text>
                              </View>
                              <Ionicons name="calendar-outline" size={13} color="#94a3b8" style={{ marginLeft: 9 }} />
                              <Text className="ml-1 text-[11px] font-semibold text-slate-500">{formatDate(employee.issued_date)}</Text>
                            </View>
                          ) : (
                            <Text className="mt-1.5 text-xs font-bold text-amber-600">Tap to issue a uniform</Text>
                          )}
                        </View>

                        <View className={`flex-row items-center rounded-full px-2.5 py-1.5 ${issued ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                          <Ionicons
                            name={issued ? 'checkmark-circle' : 'alert-circle'}
                            size={13}
                            color={issued ? '#059669' : '#d97706'}
                          />
                          <Text className={`ml-1 text-[11px] font-extrabold ${issued ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {employee.status}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#b0bccb" style={{ marginLeft: 7 }} />
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
    marginTop: 16,
    borderRadius: 26,
    backgroundColor: '#9333ea',
  },
  heroClip: {
    borderRadius: 26,
    overflow: 'hidden',
  },
  heroGradient: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    overflow: 'hidden',
    padding: 20,
  },
});
