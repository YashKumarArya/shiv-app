import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { Alert, Text, View } from 'react-native';
import { z } from 'zod';
import { errorMessage } from '@/api/client';
import { FormField } from '@/components/form/FormField';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/providers/AuthProvider';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const { control, handleSubmit, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    try {
      await login(email, password);
      router.replace('/(app)/(tabs)');
    } catch (error) {
      Alert.alert('Login failed', errorMessage(error));
    }
  });

  return (
    <Screen className="p-6">
      <View className="flex-1 justify-center">
        <Text className="text-3xl font-bold text-slate-800">Agency Manager</Text>
        <Text className="mb-8 mt-1 text-slate-500">Sign in to manage your workforce</Text>
        <FormField control={control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none" />
        <FormField control={control} name="password" label="Password" secureTextEntry />
        <View className="mt-2">
          <Button title="Sign In" onPress={onSubmit} loading={formState.isSubmitting} />
        </View>
      </View>
    </Screen>
  );
}
