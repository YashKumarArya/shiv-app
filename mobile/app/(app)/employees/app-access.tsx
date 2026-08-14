import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useForm } from 'react-hook-form';
import { ActivityIndicator, Text, View } from 'react-native';
import { z } from 'zod';
import { api, errorMessage } from '@/api/client';
import { FormField } from '@/components/form/FormField';
import { FormSectionTitle } from '@/components/form/FormSectionTitle';
import { FormSelect } from '@/components/form/FormSelect';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';
import { confirmAction } from '@/lib/confirm';
import { notify } from '@/lib/notify';

interface FieldAccount {
  id: number;
  name: string;
  phone: string | null;
  role: 'guard' | 'supervisor';
  employee_id: number;
  status: boolean;
}

const schema = z
  .object({
    role: z.enum(['guard', 'supervisor']),
    pin: z.string().regex(/^\d{6,12}$/, 'Use 6 to 12 digits'),
    confirm_pin: z.string().min(1, 'Re-enter the PIN'),
  })
  .refine((values) => values.pin === values.confirm_pin, {
    path: ['confirm_pin'],
    message: 'The PINs do not match',
  });

export default function EmployeeAppAccess() {
  const { employee_id: employeeIdParam } = useLocalSearchParams<{ employee_id?: string }>();
  const employeeId = Number(employeeIdParam);
  const queryClient = useQueryClient();

  const account = useQuery<FieldAccount | null>({
    queryKey: ['users', { employee_id: employeeId }],
    queryFn: async () => {
      const rows: FieldAccount[] = (await api.get('/users', { params: { employee_id: employeeId } })).data;
      return rows[0] ?? null;
    },
    enabled: employeeId > 0,
  });

  const { control, handleSubmit, reset, formState } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'guard', pin: '', confirm_pin: '' },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const grant = useMutation({
    mutationFn: (values: { role: string; pin: string }) =>
      api.post('/users/field-access', { employee_id: employeeId, ...values }),
    onSuccess: async () => {
      reset({ role: 'guard', pin: '', confirm_pin: '' });
      await refresh();
      notify('App access created', 'Give the guard their PIN. They sign in with their mobile number.');
    },
    onError: (error) => notify('Couldn’t create app access', errorMessage(error)),
  });

  const resetPin = useMutation({
    mutationFn: (pin: string) =>
      api.post(`/users/field-access/${employeeId}/reset-pin`, { pin }),
    onSuccess: async () => {
      reset({ role: account.data?.role ?? 'guard', pin: '', confirm_pin: '' });
      await refresh();
      notify('PIN reset', 'Give the guard their new PIN.');
    },
    onError: (error) => notify('Couldn’t reset the PIN', errorMessage(error)),
  });

  const setStatus = useMutation({
    mutationFn: (status: boolean) => api.put(`/users/${account.data!.id}`, { status }),
    onSuccess: refresh,
    onError: (error) => notify('Couldn’t update app access', errorMessage(error)),
  });

  const submit = handleSubmit((values) => {
    if (account.data) {
      confirmAction({
        title: 'Reset this PIN?',
        message: 'The old PIN stops working immediately.',
        confirmText: 'Reset PIN',
        onConfirm: () => resetPin.mutate(values.pin),
      });
      return;
    }
    grant.mutate({ role: values.role, pin: values.pin });
  });

  if (account.isLoading) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color="#2457d6" />
      </Screen>
    );
  }
  if (account.isError) {
    return <Screen error={errorMessage(account.error)} onRetry={() => void account.refetch()} />;
  }

  const existing = account.data;
  const pending = grant.isPending || resetPin.isPending;

  return (
    <Screen
      scroll
      footer={(
        <Button
          title={existing ? 'Reset PIN' : 'Create app access'}
          icon={existing ? 'key-outline' : 'checkmark'}
          onPress={submit}
          loading={pending}
        />
      )}
    >
      {existing ? (
        <View
          style={depth.subtle}
          className={`mb-4 rounded-2xl border p-4 ${
            existing.status ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <View className="flex-row items-center">
            <Ionicons
              name={existing.status ? 'phone-portrait' : 'ban-outline'}
              size={19}
              color={existing.status ? '#059669' : '#64748b'}
            />
            <Text className={`ml-2 font-bold ${existing.status ? 'text-emerald-800' : 'text-slate-700'}`}>
              {existing.status ? 'App access is active' : 'App access is disabled'}
            </Text>
          </View>
          <Text className={`mt-1 text-sm leading-5 ${existing.status ? 'text-emerald-700' : 'text-slate-600'}`}>
            Signs in as a {existing.role} using {existing.phone}.
          </Text>
          <View className="mt-3">
            <Button
              title={existing.status ? 'Disable app access' : 'Re-enable app access'}
              variant={existing.status ? 'danger' : 'secondary'}
              icon={existing.status ? 'lock-closed-outline' : 'lock-open-outline'}
              loading={setStatus.isPending}
              onPress={() =>
                existing.status
                  ? confirmAction({
                      title: 'Disable app access?',
                      message: 'They will be signed out on their next action and cannot record patrols.',
                      confirmText: 'Disable',
                      destructive: true,
                      onConfirm: () => setStatus.mutate(false),
                    })
                  : setStatus.mutate(true)
              }
            />
          </View>
        </View>
      ) : (
        <View style={depth.subtle} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <Text className="text-sm leading-5 text-slate-600">
            Lets this employee sign in on their own phone to see their attendance and salary, and to walk
            patrol rounds. They sign in with the mobile number on their employee record.
          </Text>
        </View>
      )}

      {!existing ? (
        <>
          <FormSectionTitle title="Role" description="Supervisors will additionally oversee their site." />
          <FormSelect
            control={control}
            name="role"
            label="App role"
            options={[
              { label: 'Guard', value: 'guard' },
              { label: 'Supervisor', value: 'supervisor' },
            ]}
          />
        </>
      ) : null}

      <FormSectionTitle
        title={existing ? 'Reset PIN' : 'Set a PIN'}
        description="6 to 12 digits. The guard types this on their phone, so keep it short but not obvious — avoid 123456 or their birth year."
      />
      <FormField control={control} name="pin" label="PIN" keyboardType="number-pad" secureTextEntry />
      <FormField
        control={control}
        name="confirm_pin"
        label="Confirm PIN"
        keyboardType="number-pad"
        secureTextEntry
      />

      {formState.errors.root ? (
        <Text className="text-xs font-medium text-red-600">{formState.errors.root.message}</Text>
      ) : null}
    </Screen>
  );
}
