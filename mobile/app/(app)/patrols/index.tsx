import type { PatrolRoute } from '@/api/types';
import { ResourceList } from '@/components/ResourceList';
import { ListCard } from '@/components/ui/ListCard';
import { Screen } from '@/components/ui/Screen';

const summary = (route: PatrolRoute) => {
  const checkpoints = route.checkpoint_count ?? 0;
  const schedules = route.schedule_count ?? 0;
  return [
    route.site_name,
    `${checkpoints} checkpoint${checkpoints === 1 ? '' : 's'}`,
    schedules ? `${schedules} round${schedules === 1 ? '' : 's'}/day` : 'No times set',
  ]
    .filter(Boolean)
    .join(' · ');
};

export default function PatrolRoutes() {
  return (
    <Screen>
      <ResourceList<PatrolRoute>
        resource="patrols/routes"
        searchable
        addHref="/patrols/form"
        addLabel="Add route"
        emptyTitle="No patrol routes yet"
        emptyMessage="Create a route for a site, add its checkpoints, then print the QR stickers."
        renderItem={(route) => (
          <ListCard
            title={route.route_name}
            subtitle={summary(route)}
            badge={route.is_active ? 'Active' : 'Inactive'}
            href={`/patrols/${route.id}`}
          />
        )}
      />
    </Screen>
  );
}
