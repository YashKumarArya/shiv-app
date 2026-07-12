import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { employeeName, type Payment } from '@/api/types';
import { ResourceList } from '@/components/ResourceList';
import { ListCard } from '@/components/ui/ListCard';
import { Screen } from '@/components/ui/Screen';
import { monthName } from '@/lib/format';

export default function Payments() {
  const { employee_id } = useLocalSearchParams<{ employee_id?: string }>();
  return (
    <Screen>
      <ResourceList<Payment>
        resource="payments"
        params={{ employee_id }}
        addHref="/payments/form"
        renderItem={(p) => (
          <ListCard
            title={employeeName(p)}
            subtitle={`${monthName(p.payment_month)} ${p.payment_year}${p.payment_mode ? ` · ${p.payment_mode}` : ''}`}
            right={<Text className="font-bold text-slate-800">₹{p.amount}</Text>}
            href={`/payments/form?id=${p.id}`}
          />
        )}
      />
    </Screen>
  );
}
