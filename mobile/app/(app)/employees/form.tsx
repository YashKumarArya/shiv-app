import { z } from 'zod';
import type { Designation } from '@/api/types';
import { DateTimeField } from '@/components/form/DateTimeField';
import { FormField } from '@/components/form/FormField';
import { FormSectionTitle } from '@/components/form/FormSectionTitle';
import { FormSelect, toOptions } from '@/components/form/FormSelect';
import { PhotoPicker } from '@/components/form/PhotoPicker';
import { ResourceSelect } from '@/components/form/ResourceSelect';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useResourceForm } from '@/hooks/useResourceForm';
import { today } from '@/lib/format';
import { dateString, optionalDate, optionalMoney, optionalText, requiredId } from '@/lib/validators';

const schema = z.object({
  photo: optionalText,
  first_name: z.string().min(1, 'Required'),
  last_name: optionalText,
  designation_id: requiredId,
  phone: optionalText,
  alternate_phone: optionalText,
  email: z.string().email('Enter a valid email').or(z.literal('')).optional(),
  aadhaar_number: optionalText,
  blood_group: optionalText,
  date_of_birth: optionalDate,
  joining_date: dateString,
  salary: optionalMoney,
  address: optionalText,
});

const defaults = {
  photo: '', first_name: '', last_name: '', designation_id: '',
  phone: '', alternate_phone: '', email: '', aadhaar_number: '', blood_group: '',
  date_of_birth: '', joining_date: '', salary: '', address: '',
};

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function EmployeeForm() {
  const { control, submit, saving, isEdit, formLoading, formError, retryForm } = useResourceForm(
    'employees', schema, { ...defaults, joining_date: today() },
  );

  return (
    <Screen
      scroll
      loading={formLoading}
      error={formError}
      onRetry={() => void retryForm()}
      footer={<Button title={isEdit ? 'Update employee' : 'Add employee'} icon="checkmark" onPress={submit} loading={saving} />}
    >
      <FormSectionTitle title="Identity" description="Add a clear photo and the employee’s legal name." />
      <PhotoPicker control={control} name="photo" label="Photograph" />
      <FormField control={control} name="first_name" label="First Name" />
      <FormField control={control} name="last_name" label="Last Name" />

      <FormSectionTitle title="Employment" description="Set the employee’s role, start date and monthly salary." />
      <ResourceSelect<Designation>
        control={control}
        name="designation_id"
        label="Designation"
        resource="designations"
        params={{ is_active: isEdit ? undefined : true }}
        getOption={(d) => ({ label: d.designation_name, value: d.id })}
      />
      <DateTimeField control={control} name="joining_date" label="Joining date" />
      <FormField control={control} name="salary" label="Monthly Salary (₹)" keyboardType="numeric" />

      <FormSectionTitle title="Contact" />
      <FormField control={control} name="phone" label="Phone" keyboardType="phone-pad" />
      <FormField control={control} name="alternate_phone" label="Alternate Phone" keyboardType="phone-pad" />
      <FormField control={control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none" />
      <FormField control={control} name="address" label="Address" multiline />

      <FormSectionTitle title="Personal & verification" />
      <DateTimeField control={control} name="date_of_birth" label="Date of birth" maximumDate={new Date()} allowClear />
      <FormField control={control} name="aadhaar_number" label="Aadhaar Number" keyboardType="number-pad" />
      <FormSelect control={control} name="blood_group" label="Blood group" options={toOptions(bloodGroups)} />
    </Screen>
  );
}
