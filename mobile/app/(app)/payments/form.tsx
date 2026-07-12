import { z } from 'zod';
import { FormField } from '@/components/form/FormField';
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
  const { control, submit, saving, isEdit } = useResourceForm('payments', schema, defaults);

  return (
    <Screen scroll>
      <EmployeeSelect control={control} name="employee_id" />
      <FormSelect control={control} name="payment_month" label="Month" options={months} />
      <FormField control={control} name="payment_year" label="Year" keyboardType="number-pad" />
      <FormField control={control} name="amount" label="Amount (₹)" keyboardType="numeric" />
      <FormField control={control} name="payment_date" label="Payment Date" placeholder="YYYY-MM-DD" />
      <FormSelect control={control} name="payment_mode" label="Payment Mode" options={toOptions(['Cash', 'Bank Transfer', 'UPI'])} />
      <FormField control={control} name="transaction_reference" label="Transaction Reference" />
      <PhotoPicker control={control} name="payment_proof" label="Payment Screenshot" />
      <FormField control={control} name="remarks" label="Remarks" multiline />
      <Button title={isEdit ? 'Update Payment' : 'Record Payment'} onPress={submit} loading={saving} />
    </Screen>
  );
}
