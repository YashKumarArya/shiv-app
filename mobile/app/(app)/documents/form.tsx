import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { FormField } from '@/components/form/FormField';
import { FormSectionTitle } from '@/components/form/FormSectionTitle';
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
  const { employee_id } = useLocalSearchParams<{ employee_id?: string }>();
  const { control, submit, saving, isEdit, formLoading, formError, retryForm } = useResourceForm(
    'documents', schema, { ...defaults, employee_id: employee_id ? Number(employee_id) : '' },
  );

  return (
    <Screen
      scroll
      loading={formLoading}
      error={formError}
      onRetry={() => void retryForm()}
      footer={<Button title={isEdit ? 'Update document' : 'Upload document'} icon="cloud-upload-outline" onPress={submit} loading={saving} />}
    >
      <FormSectionTitle title="Document details" description="Attach the record to an employee and upload a clear image." />
      <EmployeeSelect control={control} name="employee_id" disabled={!!employee_id} />
      <FormSelect control={control} name="document_type" label="Document Type" options={toOptions(documentTypes)} />
      <FormField control={control} name="document_number" label="Document Number" />
      <PhotoPicker control={control} name="document_file" label="Document" />
    </Screen>
  );
}
