import type { Designation } from '@/api/types';
import { ResourceList } from '@/components/ResourceList';
import { ListCard } from '@/components/ui/ListCard';
import { Screen } from '@/components/ui/Screen';

export default function Designations() {
  return (
    <Screen>
      <ResourceList<Designation>
        resource="designations"
        searchable
        addHref="/designations/form"
        addLabel="Add role"
        emptyTitle="No designations yet"
        emptyMessage="Add roles to organize employees and salary defaults."
        renderItem={(d) => (
          <ListCard
            title={d.designation_name}
            subtitle={`₹${d.default_salary ?? '—'} · Uniform ${d.uniform_required ? 'required' : 'not required'}`}
            badge={d.is_active ? 'Active' : 'Inactive'}
            href={`/designations/form?id=${d.id}`}
          />
        )}
      />
    </Screen>
  );
}
