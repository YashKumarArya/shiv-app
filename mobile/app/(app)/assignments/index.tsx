import { useLocalSearchParams } from 'expo-router';
import { employeeName, type Assignment } from '@/api/types';
import { ResourceList } from '@/components/ResourceList';
import { ListCard } from '@/components/ui/ListCard';
import { Screen } from '@/components/ui/Screen';
import { formatDate } from '@/lib/format';

export default function Assignments() {
  const { employee_id } = useLocalSearchParams<{ employee_id?: string }>();
  return (
    <Screen>
      <ResourceList<Assignment>
        resource="assignments"
        params={{ employee_id }}
        addHref="/assignments/form"
        renderItem={(a) => (
          <ListCard
            title={employeeName(a)}
            subtitle={`${a.site_name} · ${a.shift ?? 'No shift'} · from ${formatDate(a.start_date)}`}
            badge={a.status}
            href={`/assignments/form?id=${a.id}`}
          />
        )}
      />
    </Screen>
  );
}
