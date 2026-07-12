import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import type { Location } from '@/api/types';
import { FormField } from '@/components/form/FormField';
import { FormSelect, toOptions } from '@/components/form/FormSelect';
import { EmployeeSelect, ResourceSelect } from '@/components/form/ResourceSelect';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useResourceForm } from '@/hooks/useResourceForm';
import { today } from '@/lib/format';
import { dateString, optionalId, optionalText, optionalTime, requiredId } from '@/lib/validators';

const schema = z.object({
  employee_id: requiredId,
  location_id: optionalId,
  attendance_date: dateString,
  status: z.enum(['Present', 'Absent', 'Half Day', 'Leave']),
  check_in: optionalTime,
  check_out: optionalTime,
  remarks: optionalText,
});

export default function MarkAttendance() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const { control, submit, saving, isEdit } = useResourceForm('attendance', schema, {
    employee_id: '', location_id: '', attendance_date: date ?? today(),
    status: 'Present', check_in: '', check_out: '', remarks: '',
  });

  return (
    <Screen scroll>
      <EmployeeSelect control={control} name="employee_id" />
      <FormField control={control} name="attendance_date" label="Date" placeholder="YYYY-MM-DD" />
      <FormSelect
        control={control}
        name="status"
        label="Status"
        options={toOptions(['Present', 'Absent', 'Half Day', 'Leave'])}
      />
      <ResourceSelect<Location>
        control={control}
        name="location_id"
        label="Location (optional)"
        resource="locations"
        params={{ status: true }}
        getOption={(loc) => ({ label: loc.site_name, value: loc.id })}
      />
      <FormField control={control} name="check_in" label="Check-In" placeholder="09:00" />
      <FormField control={control} name="check_out" label="Check-Out" placeholder="18:00" />
      <FormField control={control} name="remarks" label="Remarks" multiline />
      <Button title={isEdit ? 'Update Attendance' : 'Mark Attendance'} onPress={submit} loading={saving} />
    </Screen>
  );
}
