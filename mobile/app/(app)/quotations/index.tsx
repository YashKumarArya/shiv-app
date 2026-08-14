import { Text, View } from 'react-native';
import type { Quotation } from '@/api/types';
import { ResourceList } from '@/components/ResourceList';
import { ListCard } from '@/components/ui/ListCard';
import { Screen } from '@/components/ui/Screen';
import { formatDate } from '@/lib/format';

export default function Quotations() {
  return (
    <Screen>
      <ResourceList<Quotation>
        resource="quotations"
        searchable
        addHref="/quotations/form"
        addLabel="New quotation"
        emptyTitle="No quotations yet"
        emptyMessage="Create a branded rate quotation for a client."
        emptyIllustration="invoice"
        renderItem={(quotation) => (
          <ListCard
            title={quotation.client_name}
            subtitle={`${quotation.quotation_number} · ${formatDate(quotation.quotation_date)}\n${quotation.title}`}
            badge={quotation.status}
            href={`/quotations/${quotation.id}`}
            leading={(
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-50">
                <Text className="text-base font-extrabold text-brand-700">Q</Text>
              </View>
            )}
          />
        )}
      />
    </Screen>
  );
}
