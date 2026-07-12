import { z } from 'zod';
import { FormField } from '@/components/form/FormField';
import { FormSwitch } from '@/components/form/FormSwitch';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useResourceForm } from '@/hooks/useResourceForm';
import { optionalText } from '@/lib/validators';

const schema = z.object({
  site_name: z.string().min(1, 'Required'),
  client_name: optionalText,
  address: optionalText,
  city: optionalText,
  state: optionalText,
  contact_person: optionalText,
  contact_number: optionalText,
  status: z.boolean(),
});

const defaults = {
  site_name: '', client_name: '', address: '', city: '', state: '',
  contact_person: '', contact_number: '', status: true,
};

export default function LocationForm() {
  const { control, submit, saving, isEdit } = useResourceForm('locations', schema, defaults);

  return (
    <Screen scroll>
      <FormField control={control} name="site_name" label="Site Name" />
      <FormField control={control} name="client_name" label="Client Name" />
      <FormField control={control} name="address" label="Address" multiline />
      <FormField control={control} name="city" label="City" />
      <FormField control={control} name="state" label="State" />
      <FormField control={control} name="contact_person" label="Contact Person" />
      <FormField control={control} name="contact_number" label="Contact Number" keyboardType="phone-pad" />
      <FormSwitch control={control} name="status" label="Active" />
      <Button title={isEdit ? 'Update Location' : 'Add Location'} onPress={submit} loading={saving} />
    </Screen>
  );
}
