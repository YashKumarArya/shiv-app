import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import type { DashboardStats } from '@/api/types';
import { AppBackground } from '@/components/ui/AppBackground';
import { depth } from '@/components/ui/depth';
import { useAuth } from '@/providers/AuthProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];

const Metric = ({ icon, value, label, detail }: {
  icon: IconName;
  value: number;
  label: string;
  detail: string;
}) => (
  <View style={depth.subtle} className="w-[48.5%] rounded-2xl border border-white/80 bg-white p-4">
    <View className="flex-row items-start justify-between">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
        <Ionicons name={icon} size={20} color="#2457d6" />
      </View>
      <Text className="text-2xl font-extrabold tracking-tight text-brand-900">{value}</Text>
    </View>
    <Text className="mt-3 text-sm font-bold text-slate-700">{label}</Text>
    <Text className="mt-0.5 text-xs text-slate-500">{detail}</Text>
  </View>
);

const QuickAction = ({ icon, label, href }: { icon: IconName; label: string; href: string }) => {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(href as Href)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={depth.subtle}
      className="min-h-[94px] flex-1 items-center justify-center rounded-2xl border border-white/80 bg-white px-2 py-3 active:bg-slate-50"
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
        <Ionicons name={icon} size={20} color="#2457d6" />
      </View>
      <Text className="mt-2 text-center text-xs font-bold leading-4 text-slate-700">{label}</Text>
    </Pressable>
  );
};

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const { data, error, isError, isLoading, isRefetching, refetch } = useQuery<DashboardStats>({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get('/dashboard')).data,
  });

  const active = data?.active_employees ?? 0;
  const present = data?.present_today ?? 0;
  const attendancePercent = active ? Math.min(100, Math.round((present / active) * 100)) : 0;
  const dateLabel = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date());
  const firstName = user?.name.split(' ')[0] ?? 'there';
  const initial = user?.name.trim().charAt(0).toUpperCase() ?? 'A';

  return (
    <View className="flex-1 bg-transparent">
      <AppBackground />
      <ScrollView
        className="flex-1 bg-transparent"
        contentContainerClassName="p-4 pb-10"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
      {isLoading ? (
        <ActivityIndicator className="mt-12" />
      ) : isError ? (
        <View style={depth.raised} className="mt-4 items-center rounded-3xl border border-red-100 bg-white px-6 py-10">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
            <Ionicons name="cloud-offline-outline" size={26} color="#dc2626" />
          </View>
          <Text className="mt-4 text-base font-extrabold text-slate-800">Couldn’t load today’s overview</Text>
          <Text className="mt-1 text-center text-sm leading-5 text-slate-500">{errorMessage(error)}</Text>
          <Pressable
            onPress={() => refetch()}
            accessibilityRole="button"
            className="mt-5 min-h-12 justify-center rounded-xl bg-brand-50 px-5"
          >
            <Text className="font-bold text-brand-600">Try again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View className="mb-5 flex-row items-center justify-between">
            <View>
              <Text className="text-xs font-bold uppercase tracking-[1.2px] text-brand-600">{dateLabel}</Text>
              <Text className="mt-1 text-[26px] font-extrabold tracking-tight text-brand-900">Good day, {firstName}</Text>
            </View>
            <Pressable
              onPress={() => router.push('/settings')}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              style={depth.subtle}
              className="h-12 w-12 items-center justify-center rounded-2xl border border-white/80 bg-brand-100"
            >
              <Text className="text-base font-extrabold text-brand-700">{initial}</Text>
            </Pressable>
          </View>

          <View style={[depth.hero, styles.attendanceShadow]}>
            <View style={styles.attendanceClip}>
              <Pressable
                onPress={() => router.push('/(app)/(tabs)/attendance')}
                accessibilityRole="button"
                accessibilityLabel={`Attendance today, ${present} of ${active} active employees present`}
                accessibilityHint="Opens today’s attendance details"
                accessibilityValue={{
                  min: 0,
                  max: 100,
                  now: attendancePercent,
                  text: `${present} of ${active} present`,
                }}
                className="active:opacity-95"
                style={styles.attendanceCard}
              >
                <LinearGradient
                  pointerEvents="none"
                  colors={['#0f766e', '#0369a1', '#6d28d9']}
                  locations={[0, 0.52, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View pointerEvents="none" style={styles.attendanceGlowTop} />
                <View pointerEvents="none" style={styles.attendanceGlowBottom} />

                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <View className="h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                      <Ionicons name="pulse" size={18} color="#ecfeff" />
                    </View>
                    <Text className="text-sm font-bold text-white">Today’s attendance</Text>
                  </View>
                  <View className="rounded-full border border-white/10 bg-white/15 px-3 py-1.5">
                    <Text className="text-xs font-extrabold text-white">{attendancePercent}%</Text>
                  </View>
                </View>

                <View className="mt-5 flex-row items-end">
                  <Text className="text-4xl font-extrabold tracking-tight text-white">{present}</Text>
                  <Text className="mb-1.5 ml-2 flex-1 text-sm font-medium text-cyan-50/90">
                    of {active} active employees present
                  </Text>
                </View>
                <View className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
                  <View
                    className="h-full rounded-full bg-lime-300"
                    style={{ width: `${attendancePercent}%` }}
                  />
                </View>
                <View className="mt-5 flex-row items-center">
                  <Text className="text-sm font-bold text-white">Review attendance</Text>
                  <Ionicons name="arrow-forward" size={16} color="#ecfeff" style={{ marginLeft: 6 }} />
                </View>
              </Pressable>
            </View>
          </View>

          <View className="mb-3 mt-7 flex-row items-center justify-between">
            <Text className="text-lg font-extrabold text-brand-900">Overview</Text>
            <Text className="text-xs font-medium text-slate-500">Live totals</Text>
          </View>
          <View className="flex-row flex-wrap justify-between gap-y-3">
            <Metric icon="people" value={active} label="Active team" detail={`${data?.total_employees ?? 0} employees total`} />
            <Metric icon="business" value={data?.active_locations ?? 0} label="Active sites" detail="Client locations" />
          </View>

          <Text className="mb-3 mt-7 text-lg font-extrabold text-brand-900">Needs attention</Text>
          <View style={depth.subtle} className="rounded-2xl">
            <View className="overflow-hidden rounded-2xl border border-white/80 bg-white">
            {(data?.pending_payments ?? 0) === 0
              && (data?.missing_salaries ?? 0) === 0
              && (data?.uniform_pending ?? 0) === 0 ? (
              <View className="flex-row items-center p-4">
                <View className="h-11 w-11 items-center justify-center rounded-xl bg-emerald-50">
                  <Ionicons name="checkmark-circle-outline" size={22} color="#059669" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="font-bold text-slate-800">All caught up</Text>
                  <Text className="mt-0.5 text-xs text-slate-500">No salary or uniform actions need attention.</Text>
                </View>
              </View>
            ) : (
              <>
                {(data?.pending_payments ?? 0) > 0 ? (
                  <Pressable
                    onPress={() => router.push('/payments')}
                    accessibilityRole="button"
                    className={`flex-row items-center p-4 active:bg-slate-50 ${
                      (data?.missing_salaries ?? 0) > 0 || (data?.uniform_pending ?? 0) > 0
                        ? 'border-b border-slate-100'
                        : ''
                    }`}
                  >
                    <View className="h-11 w-11 items-center justify-center rounded-xl bg-amber-50">
                      <Ionicons name="wallet-outline" size={21} color="#d97706" />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="font-bold text-slate-800">Pending payments</Text>
                      <Text className="mt-0.5 text-xs text-slate-500">Employees with salary still outstanding</Text>
                    </View>
                    <Text className="mr-2 text-xl font-extrabold text-amber-600">{data?.pending_payments}</Text>
                    <Ionicons name="chevron-forward" size={17} color="#b0bccb" />
                  </Pressable>
                ) : null}
                {(data?.missing_salaries ?? 0) > 0 ? (
                  <Pressable
                    onPress={() => router.push('/payments')}
                    accessibilityRole="button"
                    className={`flex-row items-center p-4 active:bg-slate-50 ${
                      (data?.uniform_pending ?? 0) > 0 ? 'border-b border-slate-100' : ''
                    }`}
                  >
                    <View className="h-11 w-11 items-center justify-center rounded-xl bg-rose-50">
                      <Ionicons name="alert-circle-outline" size={21} color="#e11d48" />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="font-bold text-slate-800">Salary setup needed</Text>
                      <Text className="mt-0.5 text-xs text-slate-500">Employees without a monthly salary</Text>
                    </View>
                    <Text className="mr-2 text-xl font-extrabold text-rose-600">{data?.missing_salaries}</Text>
                    <Ionicons name="chevron-forward" size={17} color="#b0bccb" />
                  </Pressable>
                ) : null}
                {(data?.uniform_pending ?? 0) > 0 ? (
                  <Pressable
                    onPress={() => router.push('/uniforms')}
                    accessibilityRole="button"
                    className="flex-row items-center p-4 active:bg-slate-50"
                  >
                    <View className="h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
                      <Ionicons name="shirt-outline" size={21} color="#2563eb" />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="font-bold text-slate-800">Uniform requirements</Text>
                      <Text className="mt-0.5 text-xs text-slate-500">Active employees missing an issue</Text>
                    </View>
                    <Text className="mr-2 text-xl font-extrabold text-blue-600">{data?.uniform_pending}</Text>
                    <Ionicons name="chevron-forward" size={17} color="#b0bccb" />
                  </Pressable>
                ) : null}
              </>
            )}
            </View>
          </View>

          <Text className="mb-3 mt-7 text-lg font-extrabold text-brand-900">Quick actions</Text>
          <View className="flex-row gap-3">
            <QuickAction icon="calendar" label="Mark attendance" href="/attendance/mark" />
            <QuickAction icon="person-add" label="Add employee" href="/employees/form" />
            <QuickAction icon="cash" label="Record payment" href="/payments/form" />
          </View>
        </>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  attendanceShadow: {
    borderRadius: 24,
    backgroundColor: '#0369a1',
  },
  attendanceClip: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  attendanceCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    padding: 20,
  },
  attendanceGlowTop: {
    position: 'absolute',
    width: 150,
    height: 150,
    right: -45,
    top: -78,
    borderRadius: 999,
    backgroundColor: 'rgba(253, 224, 71, 0.16)',
  },
  attendanceGlowBottom: {
    position: 'absolute',
    width: 130,
    height: 130,
    left: -62,
    bottom: -82,
    borderRadius: 999,
    backgroundColor: 'rgba(244, 114, 182, 0.18)',
  },
});
