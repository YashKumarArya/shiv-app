import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { z } from 'zod';
import { errorMessage } from '@/api/client';
import { FormField } from '@/components/form/FormField';
import { FormSectionTitle } from '@/components/form/FormSectionTitle';
import { FormSwitch } from '@/components/form/FormSwitch';
import { Button } from '@/components/ui/Button';
import { depth } from '@/components/ui/depth';
import { Screen } from '@/components/ui/Screen';
import { useRemove } from '@/hooks/useCrud';
import { useResourceForm } from '@/hooks/useResourceForm';
import { confirmAction } from '@/lib/confirm';
import { formatCoordinates, getCurrentPosition } from '@/lib/location';
import { notify } from '@/lib/notify';
import { optionalText, requiredId } from '@/lib/validators';

const coordinate = (max: number) =>
  z.preprocess(
    (value) => (value === '' || value == null ? undefined : value),
    z.coerce.number().min(-max).max(max).optional(),
  );

const schema = z
  .object({
    route_id: requiredId,
    checkpoint_name: z.string().min(1, 'Required'),
    sequence: optionalText,
    latitude: coordinate(90),
    longitude: coordinate(180),
    is_active: z.boolean(),
  })
  .refine(
    (values) => (values.latitude === undefined) === (values.longitude === undefined),
    { path: ['latitude'], message: 'Record both coordinates, or neither' },
  );

export default function CheckpointForm() {
  const { id, route_id: routeId } = useLocalSearchParams<{ id?: string; route_id?: string }>();
  const router = useRouter();
  const [locating, setLocating] = useState(false);

  const form = useResourceForm('patrols/checkpoints', schema, {
    route_id: routeId ?? '',
    checkpoint_name: '',
    sequence: '',
    latitude: '',
    longitude: '',
    is_active: true,
  });
  const { control, submit, saving, isEdit, formLoading, formError, retryForm, setValue, watch } = form;
  const remove = useRemove('patrols/checkpoints');

  const latitude = watch('latitude');
  const longitude = watch('longitude');
  const recorded = formatCoordinates(latitude, longitude);

  const captureLocation = async () => {
    setLocating(true);
    try {
      const position = await getCurrentPosition();
      // shouldDirty so the unsaved-changes guard and the dirty-field diff both
      // treat a captured position like any other edit.
      setValue('latitude', String(position.latitude), { shouldDirty: true });
      setValue('longitude', String(position.longitude), { shouldDirty: true });
      notify(
        'Location recorded',
        position.accuracy
          ? `Accurate to about ${Math.round(position.accuracy)} m. Stand at the checkpoint for the best result.`
          : 'Stand at the checkpoint for the best result.',
      );
    } catch (error) {
      notify('Couldn’t get your location', errorMessage(error));
    } finally {
      setLocating(false);
    }
  };

  const deleteCheckpoint = () => {
    confirmAction({
      title: 'Delete this checkpoint?',
      message: 'Its printed QR sticker stops working. A checkpoint with patrol history cannot be deleted — mark it inactive instead.',
      confirmText: 'Delete',
      destructive: true,
      onConfirm: async () => {
        try {
          await remove.mutateAsync(Number(id));
          router.back();
        } catch (error) {
          notify('Couldn’t delete checkpoint', errorMessage(error));
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
            title={isEdit ? 'Update checkpoint' : 'Add checkpoint'}
            icon="checkmark"
            onPress={submit}
            loading={saving}
          />
          {isEdit ? (
            <Button
              title="Delete checkpoint"
              variant="danger"
              icon="trash-outline"
              onPress={deleteCheckpoint}
              loading={remove.isPending}
            />
          ) : null}
        </View>
      )}
    >
      <FormSectionTitle
        title="Checkpoint"
        description="A place on the route the guard must physically reach. A QR sticker is generated for it automatically."
      />
      <FormField control={control} name="checkpoint_name" label="Checkpoint Name" />
      <FormField
        control={control}
        name="sequence"
        label="Walking order (leave blank to add at the end)"
        keyboardType="numeric"
      />

      <FormSectionTitle
        title="Location"
        description="Recorded so a guard cannot scan this checkpoint from somewhere else. Capture it while standing at the spot."
      />
      <View
        style={depth.subtle}
        className={`mb-4 rounded-2xl border p-4 ${recorded ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}
      >
        <View className="flex-row items-center">
          <Ionicons
            name={recorded ? 'location' : 'warning-outline'}
            size={19}
            color={recorded ? '#059669' : '#d97706'}
          />
          <Text className={`ml-2 flex-1 text-sm font-semibold ${recorded ? 'text-emerald-800' : 'text-amber-800'}`}>
            {recorded ?? 'No location recorded'}
          </Text>
        </View>
        <Text className={`mt-1 text-xs leading-5 ${recorded ? 'text-emerald-700' : 'text-amber-700'}`}>
          {recorded
            ? 'Guards must be within the route’s allowed distance of this point to scan.'
            : 'Without a location this checkpoint can be scanned from anywhere.'}
        </Text>
        <Pressable
          onPress={() => void captureLocation()}
          disabled={locating}
          accessibilityRole="button"
          accessibilityLabel="Use my current location"
          className="mt-3 min-h-12 flex-row items-center justify-center rounded-xl bg-white px-3 active:bg-slate-100"
        >
          {locating ? (
            <ActivityIndicator color="#2457d6" />
          ) : (
            <>
              <Ionicons name="navigate-outline" size={18} color="#2457d6" />
              <Text className="ml-2 font-bold text-brand-600">
                {recorded ? 'Update to my current location' : 'Use my current location'}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      <FormField control={control} name="latitude" label="Latitude" keyboardType="numeric" />
      <FormField control={control} name="longitude" label="Longitude" keyboardType="numeric" />
      <FormSwitch control={control} name="is_active" label="Active" />
    </Screen>
  );
}
