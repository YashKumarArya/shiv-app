import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { employeeName, type Assignment, type Location, type PatrolRoute } from '@/api/types';
import { errorMessage } from '@/api/client';
import { Badge } from '@/components/ui/Badge';
import { InfoRow } from '@/components/ui/InfoRow';
import { ListCard } from '@/components/ui/ListCard';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useItem, useList } from '@/hooks/useCrud';
import { formatDate, today } from '@/lib/format';

export default function LocationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: location, error, isError, isLoading, refetch } = useItem<Location>('locations', id);
  const assignments = useList<Assignment>('assignments', { location_id: id, status: 'Active', limit: 200 });
  const routes = useList<PatrolRoute>('patrols/routes', { location_id: id, limit: 200 });
  const currentDate = today();
  const currentAssignments = (assignments.data ?? []).filter((assignment) =>
    assignment.start_date.slice(0, 10) <= currentDate
    && (!assignment.end_date || assignment.end_date.slice(0, 10) >= currentDate)
  );
  const plannedAssignments = (assignments.data ?? []).filter((assignment) =>
    assignment.start_date.slice(0, 10) > currentDate
  );
  const activeRoutes = (routes.data ?? []).filter((route) => route.is_active);
  const checkpointCount = activeRoutes.reduce((total, route) => total + (route.checkpoint_count ?? 0), 0);
  const scheduleCount = activeRoutes.reduce((total, route) => total + (route.schedule_count ?? 0), 0);

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
    <Screen scroll>
      <View className="rounded-3xl border border-slate-100 bg-white px-5 pb-5 pt-6 shadow-md">
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

      {!location.status ? (
        <Text className="mt-3 text-sm text-amber-800">Activate this site before assigning guards or printing duty stickers.</Text>
      ) : null}

      <View className="mt-6 rounded-2xl bg-white p-4">
        <Text className="text-base font-bold text-slate-900">Site setup</Text>
        <Text className="mt-2 text-sm text-slate-600">{currentAssignments.length ? '✓' : '○'} Post a guard</Text>
        <Text className="mt-1 text-sm text-slate-600">→ Print and place Start and End Duty stickers</Text>
        <Text className="mt-1 text-sm text-slate-600">{activeRoutes.length ? '✓' : '○'} Add a patrol route</Text>
        <Text className="mt-1 text-sm text-slate-600">{checkpointCount ? '✓' : '○'} Add checkpoints</Text>
        <Text className="mt-1 text-sm text-slate-600">→ Print and place checkpoint stickers</Text>
        <Text className="mt-1 text-sm text-slate-600">{scheduleCount ? '✓' : '○'} Set patrol times</Text>
      </View>

      <View className="mt-6">
        <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Site team</Text>
        <Button title="Assign employee to this site" icon="person-add-outline"
          disabled={!location.status}
          onPress={() => router.push(`/assignments/form?location_id=${id}`)} />
        {assignments.isLoading ? <ActivityIndicator className="mt-4" /> : assignments.isError ? (
          <Pressable onPress={() => void assignments.refetch()} className="mt-3 rounded-xl bg-red-50 p-4">
            <Text className="text-red-700">Couldn’t load assignments. Tap to retry.</Text>
          </Pressable>
        ) : currentAssignments.length ? currentAssignments.map((assignment) => (
          <ListCard key={assignment.id} title={employeeName(assignment)}
            subtitle={`${assignment.shift ?? 'No shift'} · since ${formatDate(assignment.start_date)}`}
            href={`/assignments/form?id=${assignment.id}`} />
        )) : <Text className="mt-3 text-sm text-slate-500">No one is currently posted to this site.</Text>}
        {plannedAssignments.length ? (
          <View className="mt-3">
            <Text className="mb-1 text-xs font-bold uppercase text-slate-500">Starting soon</Text>
            {plannedAssignments.map((assignment) => (
              <ListCard key={assignment.id} title={employeeName(assignment)}
                subtitle={`Starts ${formatDate(assignment.start_date)} · ${assignment.shift ?? 'No shift'}`}
                href={`/assignments/form?id=${assignment.id}`} />
            ))}
          </View>
        ) : null}
      </View>

      <View className="mt-6">
        <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Duty attendance</Text>
        <Button title="Print Start and End Duty QRs" icon="qr-code-outline" variant="secondary"
          disabled={!location.status}
          onPress={() => router.push(`/locations/duty-qr?location_id=${id}`)} />
        <Text className="mt-2 text-xs text-slate-500">These site codes mark attendance. Patrol checkpoint stickers record rounds separately.</Text>
      </View>

      <View className="mt-6">
        <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Patrol setup</Text>
        <Button title="Add patrol route at this site" icon="map-outline" variant="secondary"
          disabled={!location.status}
          onPress={() => router.push(`/patrols/form?location_id=${id}`)} />
        {routes.isLoading ? <ActivityIndicator className="mt-4" /> : routes.isError ? (
          <Pressable onPress={() => void routes.refetch()} className="mt-3 rounded-xl bg-red-50 p-4">
            <Text className="text-red-700">Couldn’t load routes. Tap to retry.</Text>
          </Pressable>
        ) : routes.data?.length ? routes.data.map((route) => (
          <ListCard key={route.id} title={route.route_name}
            subtitle={`${route.checkpoint_count ?? 0} checkpoints · ${route.schedule_count ?? 0} patrol times`}
            badge={route.is_active ? 'Active' : 'Inactive'} href={`/patrols/${route.id}`} />
        )) : <Text className="mt-3 text-sm text-slate-500">Add a route, then checkpoints, patrol times and QR stickers.</Text>}
      </View>
    </Screen>
  );
}
