import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import type { Location } from '@/api/types';
import { DateTimeField } from '@/components/form/DateTimeField';
import { FormField } from '@/components/form/FormField';
import { FormSectionTitle } from '@/components/form/FormSectionTitle';
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
  const { control, submit, saving, isEdit, formLoading, formError, retryForm } = useResourceForm('attendance', schema, {
    employee_id: '', location_id: '', attendance_date: date ?? today(),
    status: 'Present', check_in: '', check_out: '', remarks: '',
  });

  return (
    <Screen
      scroll
      loading={formLoading}
      error={formError}
      onRetry={() => void retryForm()}
      footer={<Button title={isEdit ? 'Update attendance' : 'Mark attendance'} icon="checkmark" onPress={submit} loading={saving} />}
    >
      <FormSectionTitle title="Attendance record" description="Choose an employee, date and explicit attendance status." />
      <EmployeeSelect control={control} name="employee_id" />
      <DateTimeField control={control} name="attendance_date" label="Attendance date" maximumDate={new Date()} />
      <FormSelect
        control={control}
        name="status"
        label="Status"
        options={toOptions(['Present', 'Absent', 'Half Day', 'Leave'])}
      />

      <FormSectionTitle title="Shift details" description="Location and times are optional." />
      <ResourceSelect<Location>
        control={control}
        name="location_id"
        label="Location (optional)"
        resource="locations"
        params={{ status: true }}
        getOption={(loc) => ({ label: loc.site_name, value: loc.id })}
        allowClear
      />
      <DateTimeField control={control} name="check_in" label="Check-in" mode="time" allowClear />
      <DateTimeField control={control} name="check_out" label="Check-out" mode="time" allowClear />
      <FormField control={control} name="remarks" label="Remarks" multiline />
    </Screen>
  );
}
