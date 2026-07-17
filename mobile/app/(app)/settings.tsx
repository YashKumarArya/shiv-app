import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Switch, Text, TextInput, View } from 'react-native';
import { z } from 'zod';
import { api, errorMessage } from '@/api/client';
import { FormField } from '@/components/form/FormField';
import { PhotoPicker } from '@/components/form/PhotoPicker';
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

const companySchema = z.object({
  company_name: z.string().optional(),
  company_address: z.string().optional(),
  company_phone: z.string().optional(),
  company_logo: z.string().optional(),
  company_signature: z.string().optional(),
});
type CompanyForm = z.infer<typeof companySchema>;
const companyDefaults: CompanyForm = {
  company_name: '', company_address: '', company_phone: '', company_logo: '', company_signature: '',
};

export default function Settings() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
    enabled: isAdmin,
  });

  const saveSalarySettings = useMutation({
    mutationFn: (payload: { salary_exclude_sundays?: string; salary_off_days?: number }) =>
      api.put('/settings', payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['payments'] });
      notify('Salary setting updated', 'Payroll now uses the new off-days rule.');
    },
    onError: (error) => notify('Unable to update setting', errorMessage(error)),
  });
  const excludeSundays = settings?.salary_exclude_sundays === 'true';

  const [extraDaysInput, setExtraDaysInput] = useState(settings?.salary_off_days ?? '0');
  useEffect(() => {
    if (settings?.salary_off_days !== undefined) setExtraDaysInput(settings.salary_off_days);
  }, [settings?.salary_off_days]);

  const toggleSundays = (value: boolean) => {
    saveSalarySettings.mutate({ salary_exclude_sundays: value ? 'true' : 'false' });
  };

  const applyExtraDays = () => {
    const days = Number(extraDaysInput);
    if (!Number.isInteger(days) || days < 0 || days > 30) {
      notify('Enter a valid number', 'Extra days off must be a whole number between 0 and 30.');
      return;
    }
    saveSalarySettings.mutate({ salary_off_days: days });
  };

  const companyForm = useForm<CompanyForm>({ defaultValues: companyDefaults });
  useEffect(() => {
    if (!settings) return;
    companyForm.reset({
      company_name: settings.company_name ?? '',
      company_address: settings.company_address ?? '',
      company_phone: settings.company_phone ?? '',
      company_logo: settings.company_logo ?? '',
      company_signature: settings.company_signature ?? '',
    });
  }, [settings]);

  const saveCompany = useMutation({
    mutationFn: (values: CompanyForm) => api.put('/settings', values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      notify('Branding updated', 'The logo and company details will appear on ID cards.');
    },
    onError: (error) => notify('Unable to update branding', errorMessage(error)),
  });
  const submitCompany = companyForm.handleSubmit((values) => saveCompany.mutate(values));

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

      {isAdmin ? (
        <>
          <View className="mb-2 mt-7 flex-row items-center px-1">
            <View className="h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
              <Ionicons name="cash-outline" size={17} color="#059669" />
            </View>
            <View className="ml-2.5">
              <Text className="font-semibold text-slate-900">Salary calculation</Text>
              <Text className="text-xs text-slate-500">Daily pay = monthly salary ÷ payable days</Text>
            </View>
          </View>
          <View className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-sm font-semibold text-slate-800">Exclude Sundays</Text>
                <Text className="mt-0.5 text-xs text-slate-500">Sundays don't count as payable days</Text>
              </View>
              <Switch
                value={excludeSundays}
                onValueChange={toggleSundays}
                disabled={saveSalarySettings.isPending}
                trackColor={{ true: '#059669' }}
              />
            </View>

            <View className="mt-4 border-t border-slate-100 pt-4">
              <Text className="text-sm font-semibold text-slate-800">Extra days off</Text>
              <Text className="mt-0.5 text-xs text-slate-500">
                Additional non-working days per month, on top of Sundays if excluded
              </Text>
              <View className="mt-3 flex-row items-center gap-2">
                <TextInput
                  value={String(extraDaysInput)}
                  onChangeText={setExtraDaysInput}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                  className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-slate-800"
                />
                <Text className="flex-1 text-xs text-slate-500">days / month</Text>
                <Button
                  title="Apply"
                  onPress={applyExtraDays}
                  loading={saveSalarySettings.isPending}
                  variant="secondary"
                />
              </View>
            </View>
          </View>
          <Text className="mt-2 px-1 text-[11px] text-slate-400">
            Payable days = days in month{excludeSundays ? ' − Sundays' : ''}
            {Number(settings?.salary_off_days) > 0 ? ` − ${settings?.salary_off_days}` : ''}. Employees earn the
            daily rate for each day worked (half days count as 0.5).
          </Text>

          <View className="mb-2 mt-7 flex-row items-center px-1">
            <View className="h-8 w-8 items-center justify-center rounded-lg bg-brand-50">
              <Ionicons name="business-outline" size={17} color="#2457d6" />
            </View>
            <View className="ml-2.5">
              <Text className="font-semibold text-slate-900">Company & ID card</Text>
              <Text className="text-xs text-slate-500">Shown on every employee's printable ID card</Text>
            </View>
          </View>
          <View className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <PhotoPicker control={companyForm.control} name="company_logo" label="Company logo" />
            <FormField
              control={companyForm.control}
              name="company_name"
              label="Company name"
              placeholder="e.g. Shiv Security Services"
            />
            <FormField
              control={companyForm.control}
              name="company_address"
              label="Address / city"
              placeholder="e.g. Moradabad"
            />
            <FormField control={companyForm.control} name="company_phone" label="Phone" keyboardType="phone-pad" />
            <PhotoPicker control={companyForm.control} name="company_signature" label="Authorized signature" />
            <Button title="Save branding" onPress={submitCompany} loading={saveCompany.isPending} />
          </View>
        </>
      ) : null}

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
