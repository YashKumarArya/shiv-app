import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api } from '@/api/client';
import type { DashboardStats } from '@/api/types';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/providers/AuthProvider';

const cards = [
  { key: 'total_employees', label: 'Total Employees', icon: 'people', tone: 'blue' },
  { key: 'active_employees', label: 'Active Employees', icon: 'checkmark-circle', tone: 'green' },
  { key: 'present_today', label: "Today's Attendance", icon: 'calendar', tone: 'violet' },
  { key: 'active_locations', label: 'Locations', icon: 'business', tone: 'cyan' },
  { key: 'pending_payments', label: 'Pending Payments', icon: 'cash', tone: 'amber' },
  { key: 'uniform_pending', label: 'Uniform Pending', icon: 'shirt', tone: 'red' },
] as const;

export default function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading, isRefetching, refetch } = useQuery<DashboardStats>({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get('/dashboard')).data,
  });

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerClassName="p-4"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      <Text className="text-2xl font-bold text-slate-800">Hi, {user?.name.split(' ')[0]}</Text>
      <Text className="mb-4 text-slate-500">Here's today's overview</Text>
      {isLoading ? (
        <ActivityIndicator className="mt-12" />
      ) : (
        <View className="flex-row flex-wrap justify-between gap-y-3">
          {cards.map(({ key, label, icon, tone }) => (
            <StatCard key={key} label={label} value={data?.[key] ?? 0} icon={icon} tone={tone} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
