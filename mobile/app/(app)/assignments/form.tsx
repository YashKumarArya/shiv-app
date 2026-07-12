import { z } from 'zod';
import type { Location } from '@/api/types';
import { FormField } from '@/components/form/FormField';
import { FormSelect, toOptions } from '@/components/form/FormSelect';
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

const defaults = { employee_id: '', location_id: '', shift: '', start_date: today() };

export default function AssignmentForm() {
  const { control, submit, saving, isEdit } = useResourceForm('assignments', schema, defaults);

  return (
    <Screen scroll>
      <EmployeeSelect control={control} name="employee_id" />
      <ResourceSelect<Location>
        control={control}
        name="location_id"
        label="Location"
        resource="locations"
        params={{ status: true }}
        getOption={(loc) => ({ label: loc.site_name, value: loc.id })}
      />
      <FormSelect control={control} name="shift" label="Shift" options={toOptions(['Day', 'Night', 'Rotational'])} />
      <FormField control={control} name="start_date" label="Start Date" placeholder="YYYY-MM-DD" />
      <Button title={isEdit ? 'Update Assignment' : 'Assign Employee'} onPress={submit} loading={saving} />
    </Screen>
  );
}
