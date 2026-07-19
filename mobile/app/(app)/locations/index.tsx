import type { Location } from '@/api/types';
import { ResourceList } from '@/components/ResourceList';
import { ListCard } from '@/components/ui/ListCard';
import { Screen } from '@/components/ui/Screen';

export default function Locations() {
  return (
    <Screen>
      <ResourceList<Location>
        resource="locations"
        searchable
        addHref="/locations/form"
        addLabel="Add location"
        emptyTitle="No locations yet"
        emptyMessage="Add a client site before assigning employees."
        renderItem={(loc) => (
          <ListCard
            title={loc.site_name}
            subtitle={[loc.client_name, loc.city].filter(Boolean).join(' · ') || undefined}
            badge={loc.status ? 'Active' : 'Inactive'}
            href={`/locations/${loc.id}`}
          />
        )}
      />
    </Screen>
  );
}
