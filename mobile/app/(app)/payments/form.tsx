import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { DateTimeField } from '@/components/form/DateTimeField';
import { FormField } from '@/components/form/FormField';
import { FormSectionTitle } from '@/components/form/FormSectionTitle';
import { FormSelect, toOptions } from '@/components/form/FormSelect';
import { PhotoPicker } from '@/components/form/PhotoPicker';
import { EmployeeSelect } from '@/components/form/ResourceSelect';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useResourceForm } from '@/hooks/useResourceForm';
import { monthName, today } from '@/lib/format';
import { optionalDate, optionalText, requiredId, requiredMoney } from '@/lib/validators';

const schema = z.object({
  employee_id: requiredId,
  payment_month: requiredId,
  payment_year: z.coerce.number().int().min(2000, 'Enter a valid year'),
  amount: requiredMoney,
  payment_date: optionalDate,
  payment_mode: z.enum(['Cash', 'Bank Transfer', 'UPI']),
  transaction_reference: optionalText,
  payment_proof: optionalText,
  remarks: optionalText,
});

const now = new Date();
const defaults = {
  employee_id: '', payment_month: now.getMonth() + 1, payment_year: now.getFullYear(),
  amount: '', payment_date: today(), payment_mode: 'Cash',
  transaction_reference: '', payment_proof: '', remarks: '',
};

const months = Array.from({ length: 12 }, (_, i) => ({ label: monthName(i + 1), value: i + 1 }));

export default function PaymentForm() {
  const { employee_id, payment_month, payment_year, amount } = useLocalSearchParams<{
    employee_id?: string;
    payment_month?: string;
    payment_year?: string;
    amount?: string;
  }>();
  const trackedMonth = Number(payment_month);
  const trackedYear = Number(payment_year);
  const fromTracker = !!employee_id && trackedMonth >= 1 && trackedMonth <= 12 && trackedYear >= 2000;
  const { control, submit, saving, isEdit, formLoading, formError, retryForm } = useResourceForm(
    'payments', schema, {
      ...defaults,
      employee_id: employee_id ? Number(employee_id) : '',
      payment_month: fromTracker ? trackedMonth : defaults.payment_month,
      payment_year: fromTracker ? trackedYear : defaults.payment_year,
      amount: amount && Number(amount) > 0 ? amount : '',
    },
  );

  return (
    <Screen
      scroll
      loading={formLoading}
      error={formError}
      onRetry={() => void retryForm()}
      footer={<Button title={isEdit ? 'Update payment' : 'Record payment'} icon="checkmark" onPress={submit} loading={saving} />}
    >
      <FormSectionTitle title="Payment details" description="Record the salary period, amount and payment method." />
      <EmployeeSelect control={control} name="employee_id" params={{}} disabled={!!employee_id || isEdit} />
      <FormSelect control={control} name="payment_month" label="Month" options={months} disabled={fromTracker || isEdit} />
      <FormField control={control} name="payment_year" label="Year" keyboardType="number-pad" editable={!fromTracker && !isEdit} />
      <FormField
        control={control}
        name="amount"
        label="Payment amount (₹)"
        keyboardType="numeric"
        helperText={fromTracker && amount ? 'Prefilled with the salary amount currently due.' : undefined}
      />
      <DateTimeField control={control} name="payment_date" label="Payment date" allowClear />
      <FormSelect control={control} name="payment_mode" label="Payment Mode" options={toOptions(['Cash', 'Bank Transfer', 'UPI'])} />
      <FormField control={control} name="transaction_reference" label="Transaction Reference" />

      <FormSectionTitle title="Proof & notes" />
      <PhotoPicker control={control} name="payment_proof" label="Payment Screenshot" />
      <FormField control={control} name="remarks" label="Remarks" multiline />
    </Screen>
  );
}
