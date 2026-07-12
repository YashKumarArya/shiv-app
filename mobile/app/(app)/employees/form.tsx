import { z } from 'zod';
import type { Designation } from '@/api/types';
import { FormField } from '@/components/form/FormField';
import { PhotoPicker } from '@/components/form/PhotoPicker';
import { ResourceSelect } from '@/components/form/ResourceSelect';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useResourceForm } from '@/hooks/useResourceForm';
import { today } from '@/lib/format';
import { dateString, optionalDate, optionalMoney, optionalText, requiredId } from '@/lib/validators';

const schema = z.object({
  photo: optionalText,
  employee_code: z.string().min(1, 'Required'),
  first_name: z.string().min(1, 'Required'),
  last_name: optionalText,
  designation_id: requiredId,
  phone: optionalText,
  alternate_phone: optionalText,
  email: z.string().email('Enter a valid email').or(z.literal('')).optional(),
  aadhaar_number: optionalText,
  date_of_birth: optionalDate,
  joining_date: dateString,
  salary: optionalMoney,
  address: optionalText,
});

const defaults = {
  photo: '', employee_code: '', first_name: '', last_name: '', designation_id: '',
  phone: '', alternate_phone: '', email: '', aadhaar_number: '',
  date_of_birth: '', joining_date: today(), salary: '', address: '',
};

export default function EmployeeForm() {
  const { control, submit, saving, isEdit } = useResourceForm('employees', schema, defaults);

  return (
    <Screen scroll>
      <PhotoPicker control={control} name="photo" label="Photograph" />
      <FormField control={control} name="employee_code" label="Employee Code" />
      <FormField control={control} name="first_name" label="First Name" />
      <FormField control={control} name="last_name" label="Last Name" />
      <ResourceSelect<Designation>
        control={control}
        name="designation_id"
        label="Designation"
        resource="designations"
        getOption={(d) => ({ label: d.designation_name, value: d.id })}
      />
      <FormField control={control} name="phone" label="Phone" keyboardType="phone-pad" />
      <FormField control={control} name="alternate_phone" label="Alternate Phone" keyboardType="phone-pad" />
      <FormField control={control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none" />
      <FormField control={control} name="aadhaar_number" label="Aadhaar Number" keyboardType="number-pad" />
      <FormField control={control} name="date_of_birth" label="Date of Birth" placeholder="YYYY-MM-DD" />
      <FormField control={control} name="joining_date" label="Joining Date" placeholder="YYYY-MM-DD" />
      <FormField control={control} name="salary" label="Monthly Salary (₹)" keyboardType="numeric" />
      <FormField control={control} name="address" label="Address" multiline />
      <Button title={isEdit ? 'Update Employee' : 'Add Employee'} onPress={submit} loading={saving} />
    </Screen>
  );
}
