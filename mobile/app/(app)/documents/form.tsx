import { z } from 'zod';
import { FormField } from '@/components/form/FormField';
import { FormSelect, toOptions } from '@/components/form/FormSelect';
import { PhotoPicker } from '@/components/form/PhotoPicker';
import { EmployeeSelect } from '@/components/form/ResourceSelect';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useResourceForm } from '@/hooks/useResourceForm';
import { optionalText, requiredId } from '@/lib/validators';

const documentTypes = ['Aadhaar Card', 'PAN Card', 'Police Verification', 'Gun License', 'Passport Photo', 'Other'];

const schema = z.object({
  employee_id: requiredId,
  document_type: z.string().min(1, 'Required'),
  document_number: optionalText,
  document_file: z.string().min(1, 'Upload the document'),
});

const defaults = { employee_id: '', document_type: '', document_number: '', document_file: '' };

export default function DocumentForm() {
  const { control, submit, saving, isEdit } = useResourceForm('documents', schema, defaults);

  return (
    <Screen scroll>
      <EmployeeSelect control={control} name="employee_id" />
      <FormSelect control={control} name="document_type" label="Document Type" options={toOptions(documentTypes)} />
      <FormField control={control} name="document_number" label="Document Number" />
      <PhotoPicker control={control} name="document_file" label="Document" />
      <Button title={isEdit ? 'Update Document' : 'Upload Document'} onPress={submit} loading={saving} />
    </Screen>
  );
}
