import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Image, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, errorMessage, fileUrl } from '@/api/client';
import { employeeName, type MyProfile } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoRow } from '@/components/ui/InfoRow';
import { Illustration } from '@/components/ui/Illustration';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';
import { confirmAction } from '@/lib/confirm';
import { formatDate } from '@/lib/format';
import { notify } from '@/lib/notify';
import { cancelPatrolReminders } from '@/lib/patrolReminders';
import { useAuth } from '@/providers/AuthProvider';

export default function GuardProfile() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const profile = useQuery<MyProfile>({
    queryKey: ['me/profile'],
    queryFn: async () => (await api.get('/me/profile')).data,
  });

  const signOut = () =>
    confirmAction({
      title: 'Sign out?',
      message: 'Anything still waiting to upload will be sent the next time you sign in on this phone.',
      confirmText: 'Sign out',
      destructive: true,
      onConfirm: async () => {
        try {
          // The alarms belong to this guard's schedule, not to the device.
          await cancelPatrolReminders();
          await logout();
          queryClient.clear();
          router.replace('/login');
        } catch (error) {
          notify('Couldn’t sign out', errorMessage(error));
        }
      },
    });

  const employee = profile.data?.employee;
  const posting = profile.data?.posting;

  return (
    <Screen>
      {profile.isLoading ? (
        <ActivityIndicator className="mt-12" color="#2457d6" />
      ) : profile.isError ? (
        <View className="p-4">
          <EmptyState
            title="Couldn’t load your profile"
            message={errorMessage(profile.error)}
            icon="cloud-offline-outline"
          />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="p-4 pb-10"
          refreshControl={
            <RefreshControl refreshing={profile.isRefetching} onRefresh={() => void profile.refetch()} />
          }
        >
          <View style={depth.subtle} className="mb-4 items-center rounded-2xl border border-slate-200 bg-white p-5">
            {employee?.photo ? (
              <Image
                source={{ uri: fileUrl(employee.photo) }}
                resizeMode="cover"
                accessibilityLabel="Your photo"
                className="h-24 w-24 rounded-full bg-slate-100"
              />
            ) : (
              <Illustration
                name="profile-user"
                size={96}
                accessibilityLabel={employee ? `${employeeName(employee)} profile placeholder` : 'Profile placeholder'}
              />
            )}
            <Text className="mt-3 text-xl font-extrabold text-slate-900">
              {employee ? employeeName(employee) : ''}
            </Text>
            <Text className="mt-0.5 text-sm text-slate-500">
              {employee?.designation_name} · {employee?.employee_code}
            </Text>
          </View>

          <View style={depth.subtle} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
            <Text className="mb-1 text-sm font-bold text-slate-800">Your posting</Text>
            {posting ? (
              <>
                <InfoRow label="Site" value={posting.site_name} />
                <InfoRow label="Shift" value={posting.shift} />
                <InfoRow label="Since" value={formatDate(posting.start_date)} />
                <InfoRow label="Address" value={posting.address} />
                <InfoRow label="Site contact" value={posting.contact_person} />
                <InfoRow label="Contact number" value={posting.contact_number} />
              </>
            ) : (
              <Text className="py-2 text-sm text-slate-500">
                You are not currently posted to a site.
              </Text>
            )}
          </View>

          <View style={depth.subtle} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
            <Text className="mb-1 text-sm font-bold text-slate-800">Your details</Text>
            <InfoRow label="Phone" value={employee?.phone} />
            <InfoRow label="Joined" value={formatDate(employee?.joining_date)} />
            <InfoRow label="Blood group" value={employee?.blood_group} />
            <InfoRow label="Address" value={employee?.address} />
          </View>

          <View className="mb-4 flex-row items-start rounded-2xl bg-slate-100 p-3.5">
            <Ionicons name="information-circle-outline" size={18} color="#475569" />
            <Text className="ml-2 flex-1 text-xs leading-5 text-slate-600">
              To change any of these details, or your PIN, ask your supervisor at the office.
            </Text>
          </View>

          <Button title="Sign out" variant="danger" icon="log-out-outline" onPress={signOut} />

          <Text className="mt-4 text-center text-xs text-slate-400">
            Signed in as {user?.phone ?? user?.name}
          </Text>
        </ScrollView>
      )}
    </Screen>
  );
}
