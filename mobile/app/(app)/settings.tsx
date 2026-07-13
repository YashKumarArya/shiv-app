import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { z } from 'zod';
import { api, errorMessage } from '@/api/client';
import { FormField } from '@/components/form/FormField';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { InfoRow } from '@/components/ui/InfoRow';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { notify } from '@/lib/notify';

const schema = z.object({
  current_password: z.string().min(1, 'Required'),
  new_password: z.string().min(6, 'At least 6 characters'),
});

type PasswordForm = z.infer<typeof schema>;

export default function Settings() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { control, handleSubmit, reset, formState } = useForm<PasswordForm>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: '', new_password: '' },
  });

  const changePassword = handleSubmit(async (values) => {
    try {
      await api.post('/auth/change-password', values);
      reset();
      notify('Password updated', 'Your new password is ready to use.');
    } catch (error) {
      notify('Unable to update password', errorMessage(error));
    }
  });

  const onLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const userInitials = user?.name
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Screen scroll className="pt-3">
      <View className="rounded-3xl border border-slate-100 bg-white p-5 shadow-md">
        <View className="flex-row items-center">
          <View className="h-16 w-16 items-center justify-center rounded-2xl border border-white bg-brand-50 shadow-sm">
            <Text className="text-xl font-bold text-brand-700">{userInitials || '—'}</Text>
          </View>
          <View className="ml-4 min-w-0 flex-1">
            <Text className="text-xl font-bold text-slate-900" numberOfLines={1}>
              {user?.name}
            </Text>
            <Text className="mt-1 text-sm text-slate-500" numberOfLines={1}>
              {user?.email}
            </Text>
            <View className="mt-2 self-start">
              <Badge label={user?.role === 'admin' ? 'Admin' : 'Office Staff'} />
            </View>
          </View>
        </View>

        {user?.phone ? (
          <View className="mt-4 border-t border-slate-100 pt-1">
            <InfoRow label="Phone" value={user.phone} />
          </View>
        ) : null}
      </View>

      <View className="mb-2 mt-7 flex-row items-center px-1">
        <View className="h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
          <Ionicons name="lock-closed-outline" size={17} color="#7c3aed" />
        </View>
        <View className="ml-2.5">
          <Text className="font-semibold text-slate-900">Password & security</Text>
          <Text className="text-xs text-slate-500">Choose at least 6 characters</Text>
        </View>
      </View>
      <View className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <FormField
          control={control}
          name="current_password"
          label="Current password"
          placeholder="Enter current password"
          secureTextEntry
          autoCapitalize="none"
          textContentType="password"
        />
        <FormField
          control={control}
          name="new_password"
          label="New password"
          placeholder="Enter new password"
          secureTextEntry
          autoCapitalize="none"
          textContentType="newPassword"
        />
        <Button title="Update Password" onPress={changePassword} loading={formState.isSubmitting} />
      </View>

      <View className="mt-7 rounded-2xl border border-red-100 bg-white p-4">
        <View className="mb-4 flex-row items-center">
          <View className="h-9 w-9 items-center justify-center rounded-xl bg-red-50">
            <Ionicons name="log-out-outline" size={19} color="#dc2626" />
          </View>
          <View className="ml-3 flex-1">
            <Text className="font-semibold text-slate-900">Sign out</Text>
            <Text className="mt-0.5 text-xs text-slate-500">Return to the login screen on this device.</Text>
          </View>
        </View>
        <Button title="Log Out" variant="danger" onPress={onLogout} />
      </View>
    </Screen>
  );
}
