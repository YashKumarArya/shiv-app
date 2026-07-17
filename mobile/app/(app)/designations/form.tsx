import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { z } from 'zod';
import { errorMessage } from '@/api/client';
import { FormField } from '@/components/form/FormField';
import { FormSectionTitle } from '@/components/form/FormSectionTitle';
import { FormSwitch } from '@/components/form/FormSwitch';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useRemove } from '@/hooks/useCrud';
import { useResourceForm } from '@/hooks/useResourceForm';
import { confirmAction } from '@/lib/confirm';
import { notify } from '@/lib/notify';
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
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { control, submit, saving, isEdit, formLoading, formError, retryForm } = useResourceForm('designations', schema, defaults);
  const remove = useRemove('designations');

  const deleteDesignation = () => {
    confirmAction({
      title: 'Delete this designation?',
      message: 'Employees currently using it must be moved to another designation first.',
      confirmText: 'Delete',
      destructive: true,
      onConfirm: async () => {
        try {
          await remove.mutateAsync(Number(id));
          router.back();
        } catch (error) {
          notify('Couldn’t delete designation', errorMessage(error));
        }
      },
    });
  };

  return (
    <Screen
      scroll
      loading={formLoading}
      error={formError}
      onRetry={() => void retryForm()}
      footer={(
        <View className="gap-2">
          <Button
            title={isEdit ? 'Update designation' : 'Add designation'}
            icon="checkmark"
            onPress={submit}
            loading={saving}
          />
          {isEdit ? (
            <Button
              title="Delete designation"
              variant="danger"
              icon="trash-outline"
              onPress={deleteDesignation}
              loading={remove.isPending}
            />
          ) : null}
        </View>
      )}
    >
      <FormSectionTitle title="Role details" description="Define salary and uniform defaults for this designation." />
      <FormField control={control} name="designation_name" label="Designation Name" />
      <FormField control={control} name="description" label="Description" multiline />
      <FormField control={control} name="default_salary" label="Default Salary (₹)" keyboardType="numeric" />
      <FormSwitch control={control} name="uniform_required" label="Uniform Required" />
      <FormSwitch control={control} name="is_active" label="Active" />
    </Screen>
  );
}
