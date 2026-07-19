import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { employeeName, type Assignment, type Location } from '@/api/types';
import { errorMessage } from '@/api/client';
import { Badge } from '@/components/ui/Badge';
import { InfoRow } from '@/components/ui/InfoRow';
import { ListCard } from '@/components/ui/ListCard';
import { ResourceList } from '@/components/ResourceList';
import { Screen } from '@/components/ui/Screen';
import { useItem } from '@/hooks/useCrud';
import { formatDate } from '@/lib/format';

export default function LocationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: location, error, isError, isLoading, refetch } = useItem<Location>('locations', id);

  if (isError) {
    return <Screen error={errorMessage(error)} onRetry={() => void refetch()} />;
  }

  if (isLoading || !location) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color="#2457d6" />
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="rounded-3xl border border-slate-100 bg-white px-5 pb-5 pt-6 shadow-md mx-4 mt-3">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-xl font-bold text-slate-900">{location.site_name}</Text>
            {location.client_name ? (
              <Text className="mt-1 text-sm text-slate-500">{location.client_name}</Text>
            ) : null}
          </View>
          <Badge label={location.status ? 'Active' : 'Inactive'} />
        </View>

        <View className="mt-4">
          <InfoRow label="Address" value={[location.address, location.city, location.state].filter(Boolean).join(', ') || undefined} />
          <InfoRow label="Contact person" value={location.contact_person} />
          <InfoRow label="Contact number" value={location.contact_number} />
        </View>

        <Pressable
          onPress={() => router.push(`/locations/form?id=${id}` as Href)}
          accessibilityRole="button"
          accessibilityLabel="Edit location"
          className="mt-4 flex-row items-center justify-center rounded-xl bg-brand-600 px-4 py-3 active:opacity-80"
        >
          <Ionicons name="create-outline" size={18} color="white" />
          <Text className="ml-2 font-semibold text-white">Edit</Text>
        </Pressable>
      </View>

      <Text className="mb-2 mt-6 px-5 text-xs font-bold uppercase tracking-wider text-slate-400">
        Employees at this site
      </Text>
      <ResourceList<Assignment>
        resource="assignments"
        params={{ location_id: id, status: 'Active' }}
        emptyTitle="No employees assigned"
        emptyMessage="Assign an employee to this site from the Assignments screen."
        renderItem={(a) => (
          <ListCard
            title={employeeName(a)}
            subtitle={`${a.shift ?? 'No shift'} · since ${formatDate(a.start_date)}`}
            href={`/employees/${a.employee_id}`}
          />
        )}
      />
    </Screen>
  );
}
