import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { DateTimeField } from '@/components/form/DateTimeField';
import { FormField } from '@/components/form/FormField';
import { FormSectionTitle } from '@/components/form/FormSectionTitle';
import { FormSelect, toOptions } from '@/components/form/FormSelect';
import { EmployeeSelect } from '@/components/form/ResourceSelect';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useResourceForm } from '@/hooks/useResourceForm';
import { today } from '@/lib/format';
import { dateString, optionalText, requiredId } from '@/lib/validators';

const schema = z.object({
  employee_id: requiredId,
  issued_date: dateString,
  uniform_size: optionalText,
  remarks: optionalText,
});

const defaults = { employee_id: '', issued_date: '', uniform_size: '', remarks: '' };

export default function UniformForm() {
  const { employee_id } = useLocalSearchParams<{ employee_id?: string }>();
  const { control, submit, saving, formLoading, formError, retryForm } = useResourceForm(
    'uniforms', schema, {
      ...defaults,
      employee_id: employee_id ? Number(employee_id) : '',
      issued_date: today(),
    },
  );

  return (
    <Screen
      scroll
      loading={formLoading}
      error={formError}
      onRetry={() => void retryForm()}
      footer={<Button title="Issue uniform" icon="checkmark" onPress={submit} loading={saving} />}
    >
      <FormSectionTitle title="Issue details" description="Record the employee, issue date and uniform size." />
      <EmployeeSelect control={control} name="employee_id" disabled={!!employee_id} />
      <DateTimeField control={control} name="issued_date" label="Issue date" />
      <FormSelect control={control} name="uniform_size" label="Size" options={toOptions(['S', 'M', 'L', 'XL', 'XXL'])} />
      <FormField control={control} name="remarks" label="Remarks" multiline />
    </Screen>
  );
}
