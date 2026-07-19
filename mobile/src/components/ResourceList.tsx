import { useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { errorMessage } from '@/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { useList, type ListParams } from '@/hooks/useCrud';
import { EmptyState } from './ui/EmptyState';
import { FAB } from './ui/FAB';
import { SearchBar } from './ui/SearchBar';
import { depth } from './ui/depth';

interface Props<T> {
  resource: string;
  params?: ListParams;
  searchable?: boolean;
  addHref?: string;
  addLabel?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  fabWithinTab?: boolean;
  renderItem: (item: T) => ReactElement;
}

/** Generic searchable, pull-to-refresh list for any API resource. */
export function ResourceList<T extends { id: number }>({
  resource, params, searchable, addHref, addLabel, emptyTitle, emptyMessage, fabWithinTab, renderItem,
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
        <View style={depth.raised} className="mx-4 mt-10 items-center rounded-3xl border border-red-100 bg-white p-8">
          <Text className="text-base font-bold text-slate-800">Couldn’t load this list</Text>
          <Text className="mt-1 text-center text-sm text-slate-500">{errorMessage(error)}</Text>
          <Pressable
            onPress={() => refetch()}
            accessibilityRole="button"
            className="mt-4 rounded-xl bg-brand-50 px-4 py-2.5"
          >
            <Text className="font-bold text-brand-600">Try again</Text>
          </Pressable>
        </View>
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
            />
          )}
        />
      )}
      {addHref && <FAB href={addHref} label={addLabel} withinTab={fabWithinTab} />}
    </View>
  );
}
