import { z } from 'zod';
import { FormField } from '@/components/form/FormField';
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

const defaults = { employee_id: '', issued_date: today(), uniform_size: '', remarks: '' };

export default function UniformForm() {
  const { control, submit, saving } = useResourceForm('uniforms', schema, defaults);

  return (
    <Screen scroll>
      <EmployeeSelect control={control} name="employee_id" />
      <FormField control={control} name="issued_date" label="Issue Date" placeholder="YYYY-MM-DD" />
      <FormSelect control={control} name="uniform_size" label="Size" options={toOptions(['S', 'M', 'L', 'XL', 'XXL'])} />
      <FormField control={control} name="remarks" label="Remarks" multiline />
      <Button title="Issue Uniform" onPress={submit} loading={saving} />
    </Screen>
  );
}
