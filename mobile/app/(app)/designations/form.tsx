import { z } from 'zod';
import { FormField } from '@/components/form/FormField';
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
  const { control, submit, saving, isEdit } = useResourceForm('designations', schema, defaults);

  return (
    <Screen scroll>
      <FormField control={control} name="designation_name" label="Designation Name" />
      <FormField control={control} name="description" label="Description" multiline />
      <FormField control={control} name="default_salary" label="Default Salary (₹)" keyboardType="numeric" />
      <FormSwitch control={control} name="uniform_required" label="Uniform Required" />
      <FormSwitch control={control} name="is_active" label="Active" />
      <Button title={isEdit ? 'Update Designation' : 'Add Designation'} onPress={submit} loading={saving} />
    </Screen>
  );
}
