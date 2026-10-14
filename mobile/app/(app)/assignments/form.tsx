import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { z } from 'zod';
import { errorMessage } from '@/api/client';
import type { Assignment, Location } from '@/api/types';
import { DateTimeField } from '@/components/form/DateTimeField';
import { FormSelect, toOptions } from '@/components/form/FormSelect';
import { FormSectionTitle } from '@/components/form/FormSectionTitle';
import { EmployeeSelect, ResourceSelect } from '@/components/form/ResourceSelect';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useItem, useSave } from '@/hooks/useCrud';
import { useResourceForm } from '@/hooks/useResourceForm';
import { confirmAction } from '@/lib/confirm';
import { today } from '@/lib/format';
import { notify } from '@/lib/notify';
import { dateString, optionalText, requiredId } from '@/lib/validators';

const schema = z.object({
  employee_id: requiredId,
  location_id: requiredId,
  shift: optionalText,
  start_date: dateString,
});

const defaults = { employee_id: '', location_id: '', shift: '', start_date: '' };

export default function AssignmentForm() {
  const { id, employee_id, location_id } = useLocalSearchParams<{ id?: string; employee_id?: string; location_id?: string }>();
  const router = useRouter();
  const assignment = useItem<Assignment>('assignments', id);
  const endPosting = useSave('assignments');
  const { control, submit, saving, isEdit, formLoading, formError, retryForm } = useResourceForm(
    'assignments', schema, {
      ...defaults,
      employee_id: employee_id ? Number(employee_id) : '',
      location_id: location_id ? Number(location_id) : '',
      start_date: today(),
    },
  );

  const canEnd = isEdit && assignment.data?.status === 'Active'
    && assignment.data.start_date.slice(0, 10) <= today();
  const endAssignment = () => confirmAction({
    title: 'End this posting?',
    message: 'The employee will no longer see this site or its patrols. The posting history is kept.',
    confirmText: 'End posting',
    destructive: true,
    onConfirm: async () => {
      try {
        await endPosting.mutateAsync({ id, status: 'Ended', end_date: today() });
        router.back();
      } catch (error) {
        notify('Couldn’t end posting', errorMessage(error));
      }
    },
  });

  return (
    <Screen
      scroll
      loading={formLoading}
      error={formError}
      onRetry={() => void retryForm()}
      footer={<View className="gap-2">
        <Button title={isEdit ? 'Update assignment' : 'Assign employee'} icon="checkmark" onPress={submit} loading={saving} />
        {canEnd ? <Button title="End posting" icon="close-circle-outline" variant="danger"
          onPress={endAssignment} loading={endPosting.isPending} /> : null}
      </View>}
    >
      <FormSectionTitle title="Posting details" description="Choose who is being assigned, where and when they start." />
      <EmployeeSelect control={control} name="employee_id" disabled={!!employee_id || isEdit} />
      <ResourceSelect<Location>
        control={control}
        name="location_id"
        label="Location"
        resource="locations"
        params={{ status: true }}
        getOption={(loc) => ({ label: loc.site_name, value: loc.id })}
        disabled={!!location_id || isEdit}
      />
      <FormSelect control={control} name="shift" label="Shift" options={toOptions(['Day', 'Night', 'Rotational'])} />
      <DateTimeField control={control} name="start_date" label="Start date" />
    </Screen>
  );
}
