import { useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { useDebounce } from '@/hooks/useDebounce';
import { useList, type ListParams } from '@/hooks/useCrud';
import { EmptyState } from './ui/EmptyState';
import { FAB } from './ui/FAB';
import { SearchBar } from './ui/SearchBar';

interface Props<T> {
  resource: string;
  params?: ListParams;
  searchable?: boolean;
  addHref?: string;
  renderItem: (item: T) => ReactElement;
}

/** Generic searchable, pull-to-refresh list for any API resource. */
export function ResourceList<T extends { id: number }>({
  resource, params, searchable, addHref, renderItem,
}: Props<T>) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const { data, isLoading, isRefetching, refetch } = useList<T>(resource, {
    ...params,
    search: debouncedSearch || undefined,
  });

  return (
    <View className="flex-1">
      {searchable && <SearchBar value={search} onChange={setSearch} />}
      {isLoading ? (
        <ActivityIndicator className="mt-12" />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => renderItem(item)}
          contentContainerClassName="p-4 pb-28"
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={<EmptyState />}
        />
      )}
      {addHref && <FAB href={addHref} />}
    </View>
  );
}
