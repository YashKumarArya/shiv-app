import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { Alert, Text, View } from 'react-native';
import { z } from 'zod';
import { api, errorMessage } from '@/api/client';
import { FormField } from '@/components/form/FormField';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/providers/AuthProvider';

const schema = z.object({
  current_password: z.string().min(1, 'Required'),
  new_password: z.string().min(6, 'At least 6 characters'),
});

export default function Settings() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { control, handleSubmit, reset, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { current_password: '', new_password: '' },
  });

  const changePassword = handleSubmit(async (values) => {
    try {
      await api.post('/auth/change-password', values);
      reset();
      Alert.alert('Success', 'Password updated');
    } catch (error) {
      Alert.alert('Error', errorMessage(error));
    }
  });

  const onLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <Screen scroll>
      <View className="mb-6 flex-row items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
        <View>
          <Text className="text-base font-semibold text-slate-800">{user?.name}</Text>
          <Text className="text-sm text-slate-500">{user?.email}</Text>
        </View>
        <Badge label={user?.role === 'admin' ? 'Admin' : 'Office Staff'} />
      </View>

      <Text className="mb-2 text-sm font-semibold uppercase text-slate-400">Change Password</Text>
      <FormField control={control} name="current_password" label="Current Password" secureTextEntry />
      <FormField control={control} name="new_password" label="New Password" secureTextEntry />
      <Button title="Update Password" onPress={changePassword} loading={formState.isSubmitting} />

      <View className="mt-8">
        <Button title="Log Out" variant="danger" onPress={onLogout} />
      </View>
    </Screen>
  );
}
