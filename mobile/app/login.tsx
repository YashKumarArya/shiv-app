import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Image, Linking, Pressable, Text, View, type TextInputProps } from 'react-native';
import { z } from 'zod';
import { errorMessage } from '@/api/client';
import { FormField } from '@/components/form/FormField';
import { Button } from '@/components/ui/Button';
import { depth } from '@/components/ui/depth';
import { Screen } from '@/components/ui/Screen';
import { useAuth, type Credentials } from '@/providers/AuthProvider';
import { notify } from '@/lib/notify';

type Mode = 'office' | 'field';

const schema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

type LoginValues = z.infer<typeof schema>;

interface ModeConfig {
  title: string;
  subtitle: string;
  identifier: { label: string } & TextInputProps;
  password: { label: string } & TextInputProps;
  /** Validates the identifier for this sign-in method. */
  refine: (values: LoginValues) => string | null;
  credentials: (values: LoginValues) => Credentials;
}

const MODES: Record<Mode, ModeConfig> = {
  office: {
    title: 'Welcome back',
    subtitle: 'Sign in with your office account',
    identifier: {
      label: 'Email address',
      keyboardType: 'email-address',
      autoCapitalize: 'none',
      autoComplete: 'email',
    },
    password: { label: 'Password', secureTextEntry: true, autoComplete: 'current-password' },
    refine: ({ identifier }) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim()) ? null : 'Enter a valid email',
    credentials: ({ identifier, password }) => ({
      email: identifier.trim().toLowerCase(),
      password,
    }),
  },
  field: {
    title: 'Guard sign in',
    subtitle: 'Use your mobile number and the PIN your supervisor gave you',
    identifier: {
      label: 'Mobile number',
      keyboardType: 'phone-pad',
      autoComplete: 'tel',
    },
    password: {
      label: 'PIN',
      keyboardType: 'number-pad',
      secureTextEntry: true,
      autoComplete: 'off',
    },
    // Spaces and dashes are how people actually write a phone number; only the
    // digits are compared, so accept whatever they type.
    refine: ({ identifier }) =>
      identifier.replace(/\D/g, '').length >= 10 ? null : 'Enter your 10-digit mobile number',
    credentials: ({ identifier, password }) => ({
      phone: identifier.replace(/\D/g, ''),
      password,
    }),
  },
};

/**
 * One sign-in form, mounted fresh per mode.
 *
 * Rendered with key={mode} by the screen below. Without a distinct identity the
 * two modes reconcile onto the same component instances, and the inputs stay
 * bound to the previous mode's form — which shows up as typing into the phone
 * field doing nothing.
 */
const LoginForm = ({ mode }: { mode: Mode }) => {
  const config = MODES[mode];
  const { login } = useAuth();
  const router = useRouter();

  const { control, handleSubmit, setError, formState } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: '', password: '' },
  });

  const submit = handleSubmit(async (values) => {
    const problem = config.refine(values);
    if (problem) {
      setError('identifier', { message: problem });
      return;
    }
    try {
      await login(config.credentials(values));
      // The index route picks the office or field stack from the signed-in role.
      router.replace('/');
    } catch (error) {
      notify('Login failed', errorMessage(error));
    }
  });

  return (
    <>
      <Text className="text-xl font-extrabold text-slate-800">{config.title}</Text>
      <Text className="mb-5 mt-1 text-sm text-slate-500">{config.subtitle}</Text>
      <FormField control={control} name="identifier" {...config.identifier} />
      <FormField control={control} name="password" {...config.password} />
      <View className="mt-2">
        <Button
          title="Sign in"
          icon="arrow-forward"
          onPress={submit}
          loading={formState.isSubmitting}
        />
      </View>
    </>
  );
};

export default function Login() {
  const [mode, setMode] = useState<Mode>('office');

  const tab = (value: Mode, label: string, icon: keyof typeof Ionicons.glyphMap) => (
    <Pressable
      key={value}
      onPress={() => setMode(value)}
      accessibilityRole="tab"
      accessibilityState={{ selected: mode === value }}
      className={`min-h-11 flex-1 flex-row items-center justify-center rounded-xl px-3 ${
        mode === value ? 'bg-white' : ''
      }`}
      style={mode === value ? depth.subtle : undefined}
    >
      <Ionicons name={icon} size={17} color={mode === value ? '#2457d6' : '#7b8ba1'} />
      <Text className={`ml-2 font-bold ${mode === value ? 'text-brand-600' : 'text-slate-500'}`}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Screen scroll safeTop backgroundVariant="auth" className="justify-center px-6 py-8">
      <View className="mb-8 items-center">
        <Image
          source={require('../assets/illustrations/security-fingerprint.png')}
          resizeMode="contain"
          accessible={false}
          className="h-44 w-44"
        />
        <Text className="mt-1 text-center text-3xl font-extrabold tracking-tight text-brand-900">Agency Manager</Text>
        <Text className="mt-2 max-w-[300px] text-center text-base leading-6 text-slate-500">
          Your team, attendance and operations in one secure place.
        </Text>
      </View>

      <View style={depth.hero} className="rounded-3xl border border-white/90 bg-white p-5">
        <View className="mb-5 flex-row rounded-2xl bg-slate-100 p-1">
          {tab('office', 'Office', 'briefcase-outline')}
          {tab('field', 'Guard', 'shield-outline')}
        </View>

        <LoginForm key={mode} mode={mode} />
      </View>

      <View className="mt-6 flex-row items-center justify-center gap-2">
        <Ionicons name="lock-closed-outline" size={14} color="#7b8ba1" />
        <Text className="text-xs font-medium text-slate-500">Protected workforce access</Text>
      </View>
      <Pressable
        onPress={() => void Linking
          .openURL('https://icons8.com/illustrations')
          .catch(() => undefined)}
        accessibilityRole="link"
        accessibilityLabel="Illustrations by Icons8"
        className="mt-1 min-h-11 items-center justify-center"
      >
        <Text className="text-[10px] text-slate-400">Illustrations by Icons8</Text>
      </Pressable>
    </Screen>
  );
}
