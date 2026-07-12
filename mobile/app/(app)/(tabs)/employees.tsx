import { employeeName, type Employee } from '@/api/types';
import { ResourceList } from '@/components/ResourceList';
import { ListCard } from '@/components/ui/ListCard';
import { Screen } from '@/components/ui/Screen';

export default function Employees() {
  return (
    <Screen>
      <ResourceList<Employee>
        resource="employees"
        searchable
        addHref="/employees/form"
        renderItem={(e) => (
          <ListCard
            title={employeeName(e)}
            subtitle={`${e.employee_code} · ${e.designation_name}`}
            badge={e.status}
            href={`/employees/${e.id}`}
          />
        )}
      />
    </Screen>
  );
}
