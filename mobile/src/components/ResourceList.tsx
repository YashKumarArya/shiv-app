import { useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { errorMessage } from '@/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { useList, type ListParams } from '@/hooks/useCrud';
import { EmptyState } from './ui/EmptyState';
import type { IllustrationName } from './ui/Illustration';
import { FAB } from './ui/FAB';
import { SearchBar } from './ui/SearchBar';

interface Props<T> {
  resource: string;
  params?: ListParams;
  searchable?: boolean;
  addHref?: string;
  addLabel?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyIllustration?: IllustrationName;
  fabWithinTab?: boolean;
  renderItem: (item: T) => ReactElement;
}

/** Generic searchable, pull-to-refresh list for any API resource. */
export function ResourceList<T extends { id: number }>({
  resource, params, searchable, addHref, addLabel, emptyTitle, emptyMessage, emptyIllustration,
  fabWithinTab, renderItem,
}: Props<T>) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const { data, isLoading, isError, error, isRefetching, refetch, fetchStatus } = useList<T>(resource, {
    ...params,
    search: debouncedSearch || undefined,
    limit: 200,
  });

  return (
    <View className="flex-1">
      {searchable && <SearchBar value={search} onChange={setSearch} />}
      {isLoading ? (
        fetchStatus === 'paused' ? (
          <EmptyState
            title="You’re offline"
            message="Connect to the internet to load this list for the first time."
            icon="cloud-offline-outline"
          />
        ) : (
          <ActivityIndicator className="mt-12" />
        )
      ) : isError ? (
        <EmptyState
          title="Couldn’t load this list"
          message={errorMessage(error)}
          illustration="offline"
          action={(
            <Pressable
              onPress={() => refetch()}
              accessibilityRole="button"
              className="min-h-12 justify-center rounded-xl bg-brand-50 px-5"
            >
              <Text className="font-bold text-brand-600">Try again</Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => renderItem(item)}
          contentContainerClassName="p-4 pb-32"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={(
            <EmptyState
              title={search ? 'No matching results' : emptyTitle}
              message={search ? `Try a different search for “${search}”.` : emptyMessage}
              icon={search ? 'search-outline' : undefined}
              illustration={search ? undefined : emptyIllustration}
            />
          )}
        />
      )}
      {addHref && <FAB href={addHref} label={addLabel} withinTab={fabWithinTab} />}
    </View>
  );
}
