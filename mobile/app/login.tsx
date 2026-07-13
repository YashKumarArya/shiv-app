import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { z } from 'zod';
import { errorMessage } from '@/api/client';
import { FormField } from '@/components/form/FormField';
import { Button } from '@/components/ui/Button';
import { depth } from '@/components/ui/depth';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { notify } from '@/lib/notify';

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
      notify('Login failed', errorMessage(error));
    }
  });

  return (
    <Screen scroll safeTop backgroundVariant="auth" className="justify-center px-6 py-8">
      <View className="mb-9">
        <View style={depth.raised} className="h-16 w-16 items-center justify-center rounded-[22px] border border-white/20 bg-brand-600">
          <Ionicons name="shield-checkmark" size={31} color="white" />
        </View>
        <Text className="mt-6 text-3xl font-extrabold tracking-tight text-brand-900">Agency Manager</Text>
        <Text className="mt-2 max-w-[300px] text-base leading-6 text-slate-500">
          Your team, attendance and operations in one secure place.
        </Text>
      </View>

      <View style={depth.hero} className="rounded-3xl border border-white/90 bg-white p-5">
        <Text className="text-xl font-extrabold text-slate-800">Welcome back</Text>
        <Text className="mb-5 mt-1 text-sm text-slate-500">Sign in with your office account</Text>
        <FormField
          control={control}
          name="email"
          label="Email address"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <FormField
          control={control}
          name="password"
          label="Password"
          secureTextEntry
          autoComplete="current-password"
        />
        <View className="mt-2">
          <Button title="Sign in" icon="arrow-forward" onPress={onSubmit} loading={formState.isSubmitting} />
        </View>
      </View>

      <View className="mt-6 flex-row items-center justify-center gap-2">
        <Ionicons name="lock-closed-outline" size={14} color="#7b8ba1" />
        <Text className="text-xs font-medium text-slate-500">Protected workforce access</Text>
      </View>
    </Screen>
  );
}
