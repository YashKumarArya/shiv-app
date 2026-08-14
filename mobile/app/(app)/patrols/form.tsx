import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { z } from 'zod';
import { errorMessage } from '@/api/client';
import type { Location } from '@/api/types';
import { FormField } from '@/components/form/FormField';
import { FormSectionTitle } from '@/components/form/FormSectionTitle';
import { FormSwitch } from '@/components/form/FormSwitch';
import { ResourceSelect } from '@/components/form/ResourceSelect';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useRemove } from '@/hooks/useCrud';
import { useResourceForm } from '@/hooks/useResourceForm';
import { confirmAction } from '@/lib/confirm';
import { notify } from '@/lib/notify';
import { optionalText, requiredId } from '@/lib/validators';

const schema = z.object({
  location_id: requiredId,
  route_name: z.string().min(1, 'Required'),
  description: optionalText,
  geofence_metres: z.coerce
    .number()
    .int()
    .min(10, 'Use at least 10 m')
    .max(2000, 'Use at most 2000 m'),
  grace_minutes: z.coerce
    .number()
    .int()
    .min(5, 'Use at least 5 minutes')
    .max(720, 'Use at most 720 minutes'),
  is_active: z.boolean(),
});

const defaults = {
  location_id: '',
  route_name: '',
  description: '',
  geofence_metres: '75',
  grace_minutes: '30',
  is_active: true,
};

export default function PatrolRouteForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { control, submit, saving, isEdit, formLoading, formError, retryForm } =
    useResourceForm('patrols/routes', schema, defaults);
  const remove = useRemove('patrols/routes');

  const deleteRoute = () => {
    confirmAction({
      title: 'Delete this route?',
      message: 'Its checkpoints and patrol times are deleted too. Routes with patrol history cannot be deleted — mark them inactive instead.',
      confirmText: 'Delete',
      destructive: true,
      onConfirm: async () => {
        try {
          await remove.mutateAsync(Number(id));
          router.back();
        } catch (error) {
          notify('Couldn’t delete route', errorMessage(error));
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
            title={isEdit ? 'Update route' : 'Add route'}
            icon="checkmark"
            onPress={submit}
            loading={saving}
          />
          {isEdit ? (
            <Button
              title="Delete route"
              variant="danger"
              icon="trash-outline"
              onPress={deleteRoute}
              loading={remove.isPending}
            />
          ) : null}
        </View>
      )}
    >
      <FormSectionTitle
        title="Route details"
        description="A named walking round at one site. Add its checkpoints after saving."
      />
      <ResourceSelect<Location>
        control={control}
        name="location_id"
        label="Site"
        resource="locations"
        params={{ status: 'true' }}
        getOption={(location) => ({
          label: location.client_name ? `${location.site_name} (${location.client_name})` : location.site_name,
          value: location.id,
        })}
      />
      <FormField control={control} name="route_name" label="Route Name" />
      <FormField control={control} name="description" label="Description" multiline />

      <FormSectionTitle
        title="Rules"
        description="How close a guard must be to a checkpoint, and how late a round may still be walked."
      />
      <FormField
        control={control}
        name="geofence_metres"
        label="Allowed distance from checkpoint (metres)"
        keyboardType="numeric"
      />
      <FormField
        control={control}
        name="grace_minutes"
        label="Grace period after start time (minutes)"
        keyboardType="numeric"
      />
      <FormSwitch control={control} name="is_active" label="Active" />
    </Screen>
  );
}
