import { z } from 'zod';
import { FormField } from '@/components/form/FormField';
import { FormSectionTitle } from '@/components/form/FormSectionTitle';
import { FormSwitch } from '@/components/form/FormSwitch';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useResourceForm } from '@/hooks/useResourceForm';
import { optionalMoney, optionalText } from '@/lib/validators';

const schema = z.object({
  designation_name: z.string().min(1, 'Required'),
  description: optionalText,
  default_salary: optionalMoney,
  uniform_required: z.boolean(),
  is_active: z.boolean(),
});

const defaults = {
  designation_name: '', description: '', default_salary: '',
  uniform_required: true, is_active: true,
};

export default function DesignationForm() {
  const { control, submit, saving, isEdit, formLoading, formError, retryForm } = useResourceForm('designations', schema, defaults);

  return (
    <Screen
      scroll
      loading={formLoading}
      error={formError}
      onRetry={() => void retryForm()}
      footer={<Button title={isEdit ? 'Update designation' : 'Add designation'} icon="checkmark" onPress={submit} loading={saving} />}
    >
      <FormSectionTitle title="Role details" description="Define salary and uniform defaults for this designation." />
      <FormField control={control} name="designation_name" label="Designation Name" />
      <FormField control={control} name="description" label="Description" multiline />
      <FormField control={control} name="default_salary" label="Default Salary (₹)" keyboardType="numeric" />
      <FormSwitch control={control} name="uniform_required" label="Uniform Required" />
      <FormSwitch control={control} name="is_active" label="Active" />
    </Screen>
  );
}
