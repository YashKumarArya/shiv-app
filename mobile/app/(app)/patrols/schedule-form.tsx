import { useLocalSearchParams, useRouter } from 'expo-router';
import { Controller } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';
import { z } from 'zod';
import { errorMessage } from '@/api/client';
import { DateTimeField } from '@/components/form/DateTimeField';
import { FormSectionTitle } from '@/components/form/FormSectionTitle';
import { FormSwitch } from '@/components/form/FormSwitch';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useRemove } from '@/hooks/useCrud';
import { useResourceForm } from '@/hooks/useResourceForm';
import { confirmAction } from '@/lib/confirm';
import { notify } from '@/lib/notify';
import { requiredId } from '@/lib/validators';

// ISO weekday numbers, so Monday is 1 and Sunday is 7 — the same convention the
// database uses in days_of_week and in EXTRACT(ISODOW ...).
const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

const schema = z.object({
  route_id: requiredId,
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a time'),
  days_of_week: z.array(z.number().int().min(1).max(7)).min(1, 'Choose at least one day'),
  is_active: z.boolean(),
});

export default function PatrolScheduleForm() {
  const { id, route_id: routeId } = useLocalSearchParams<{ id?: string; route_id?: string }>();
  const router = useRouter();

  const { control, submit, saving, isEdit, formLoading, formError, retryForm } = useResourceForm(
    'patrols/schedules',
    schema,
    {
      route_id: routeId ?? '',
      start_time: '',
      days_of_week: [1, 2, 3, 4, 5, 6, 7],
      is_active: true,
    },
  );
  const remove = useRemove('patrols/schedules');

  const deleteSchedule = () => {
    confirmAction({
      title: 'Delete this patrol time?',
      message: 'Guards stop being reminded at this time. Rounds already walked are kept.',
      confirmText: 'Delete',
      destructive: true,
      onConfirm: async () => {
        try {
          await remove.mutateAsync(Number(id));
          router.back();
        } catch (error) {
          notify('Couldn’t delete patrol time', errorMessage(error));
        }
      },
    });
  };

  return (
    <Screen
      scroll
      loading={formLoading}
      error={formError}
      onRetry={() => void retryForm()}
      footer={(
        <View className="gap-2">
          <Button
            title={isEdit ? 'Update patrol time' : 'Add patrol time'}
            icon="checkmark"
            onPress={submit}
            loading={saving}
          />
          {isEdit ? (
            <Button
              title="Delete patrol time"
              variant="danger"
              icon="trash-outline"
              onPress={deleteSchedule}
              loading={remove.isPending}
            />
          ) : null}
        </View>
      )}
    >
      <FormSectionTitle
        title="Patrol time"
        description="Guards posted to this site are reminded at this time and the round is expected within the route’s grace period."
      />
      <DateTimeField control={control} name="start_time" label="Start time" mode="time" />

      <Controller
        control={control}
        name="days_of_week"
        render={({ field: { onChange, value }, fieldState: { error } }) => {
          const selected: number[] = Array.isArray(value) ? value : [];
          const toggle = (day: number) =>
            onChange(
              selected.includes(day)
                ? selected.filter((entry) => entry !== day)
                : [...selected, day].sort((a, b) => a - b),
            );

          return (
            <View className="mb-4">
              <Text className="mb-2 text-sm font-semibold text-slate-700">Days</Text>
              <View className="flex-row flex-wrap gap-2">
                {DAYS.map((day) => {
                  const active = selected.includes(day.value);
                  return (
                    <Pressable
                      key={day.value}
                      onPress={() => toggle(day.value)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: active }}
                      accessibilityLabel={day.label}
                      className={`min-h-12 min-w-[52px] items-center justify-center rounded-xl border px-3 ${
                        active ? 'border-brand-600 bg-brand-600' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <Text className={`font-bold ${active ? 'text-white' : 'text-slate-600'}`}>
                        {day.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {error ? (
                <Text accessibilityLiveRegion="polite" className="mt-1.5 text-xs font-medium text-red-600">
                  {error.message}
                </Text>
              ) : null}
            </View>
          );
        }}
      />

      <FormSwitch control={control} name="is_active" label="Active" />
    </Screen>
  );
}
