import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import type { Location } from '@/api/types';
import { DateTimeField } from '@/components/form/DateTimeField';
import { FormSelect, toOptions } from '@/components/form/FormSelect';
import { FormSectionTitle } from '@/components/form/FormSectionTitle';
import { EmployeeSelect, ResourceSelect } from '@/components/form/ResourceSelect';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useResourceForm } from '@/hooks/useResourceForm';
import { today } from '@/lib/format';
import { dateString, optionalText, requiredId } from '@/lib/validators';

const schema = z.object({
  employee_id: requiredId,
  location_id: requiredId,
  shift: optionalText,
  start_date: dateString,
});

const defaults = { employee_id: '', location_id: '', shift: '', start_date: '' };

export default function AssignmentForm() {
  const { employee_id } = useLocalSearchParams<{ employee_id?: string }>();
  const { control, submit, saving, isEdit, formLoading, formError, retryForm } = useResourceForm(
    'assignments', schema, {
      ...defaults,
      employee_id: employee_id ? Number(employee_id) : '',
      start_date: today(),
    },
  );

  return (
    <Screen
      scroll
      loading={formLoading}
      error={formError}
      onRetry={() => void retryForm()}
      footer={<Button title={isEdit ? 'Update assignment' : 'Assign employee'} icon="checkmark" onPress={submit} loading={saving} />}
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
      />
      <FormSelect control={control} name="shift" label="Shift" options={toOptions(['Day', 'Night', 'Rotational'])} />
      <DateTimeField control={control} name="start_date" label="Start date" />
    </Screen>
  );
}
