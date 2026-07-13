import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { depth } from '@/components/ui/depth';

export interface Option {
  label: string;
  value: string | number;
}

export const toOptions = (values: readonly string[]): Option[] =>
  values.map((value) => ({ label: value, value }));

export interface FormSelectProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  options: readonly Option[];
  placeholder?: string;
  searchPlaceholder?: string;
  loading?: boolean;
  disabled?: boolean;
  allowClear?: boolean;
  emptyMessage?: string;
  loadError?: string;
  onRetry?: () => void;
}

export const FormSelect = <T extends FieldValues>({
  control,
  name,
  label,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search options',
  loading = false,
  disabled = false,
  allowClear = false,
  emptyMessage = 'No options available',
  loadError,
  onRetry,
}: FormSelectProps<T>) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = useMemo(
    () =>
      normalizedQuery
        ? options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery))
        : options,
    [normalizedQuery, options],
  );

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value }, fieldState: { error } }) => {
        const selected = options.find((option) => option.value === value);

        return (
          <View className="mb-4">
            <Text className="mb-2 text-sm font-semibold text-slate-700">{label}</Text>
            <Pressable
              onPress={() => setOpen(true)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${selected?.label ?? placeholder}`}
              accessibilityHint={`Opens the ${label.toLocaleLowerCase()} options`}
              accessibilityState={{ disabled, expanded: open }}
              style={depth.subtle}
              className={`min-h-12 flex-row items-center rounded-2xl border bg-white px-4 py-3 ${
                error ? 'border-red-400' : 'border-slate-200'
              } ${disabled ? 'bg-slate-100 opacity-60' : 'active:bg-slate-50'}`}
            >
              <Text
                numberOfLines={1}
                className={`flex-1 text-base ${selected ? 'font-medium text-slate-900' : 'text-slate-400'}`}
              >
                {selected?.label ?? placeholder}
              </Text>
              {loading ? (
                <ActivityIndicator size="small" color="#64748b" />
              ) : (
                <Ionicons name="chevron-down" size={20} color="#64748b" />
              )}
            </Pressable>
            {error ? (
              <Text accessibilityLiveRegion="polite" className="mt-1.5 text-xs font-medium text-red-600">
                {error.message}
              </Text>
            ) : null}

            <Modal
              visible={open}
              transparent
              animationType="slide"
              statusBarTranslucent
              onRequestClose={close}
            >
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                className="flex-1 justify-end"
              >
                <Pressable
                  onPress={close}
                  accessibilityRole="button"
                  accessibilityLabel="Close options"
                  className="absolute inset-0 bg-slate-950/45"
                />
                <SafeAreaView
                  edges={['bottom']}
                  accessibilityViewIsModal
                  style={depth.chrome}
                  className="max-h-[78%] rounded-t-[28px] bg-white"
                >
                  <View className="h-1.5 w-10 self-center rounded-full bg-slate-300" />
                  <View className="flex-row items-center px-5 pb-3 pt-4">
                    <View className="min-w-12" />
                    <Text numberOfLines={1} className="flex-1 text-center text-lg font-bold text-slate-900">
                      {label}
                    </Text>
                    <Pressable
                      onPress={close}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                      className="h-12 w-12 items-center justify-center rounded-full active:bg-slate-100"
                    >
                      <Ionicons name="close" size={24} color="#334155" />
                    </Pressable>
                  </View>

                  {options.length > 5 ? (
                    <View className="mx-5 mb-3 min-h-12 flex-row items-center rounded-2xl bg-slate-100 px-4">
                      <Ionicons name="search" size={20} color="#64748b" />
                      <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder={searchPlaceholder}
                        placeholderTextColor="#94a3b8"
                        selectionColor="#2563eb"
                        returnKeyType="search"
                        clearButtonMode="while-editing"
                        accessibilityLabel={`Search ${label.toLocaleLowerCase()}`}
                        className="min-h-12 flex-1 px-3 text-base text-slate-900"
                      />
                    </View>
                  ) : null}

                  {allowClear && selected ? (
                    <Pressable
                      onPress={() => {
                        onChange(null);
                        close();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Clear ${label}`}
                      className="mx-5 mb-2 min-h-12 flex-row items-center justify-center rounded-xl active:bg-slate-100"
                    >
                      <Ionicons name="close-circle-outline" size={20} color="#475569" />
                      <Text className="ml-2 font-semibold text-slate-600">Clear selection</Text>
                    </Pressable>
                  ) : null}

                  <FlatList
                    data={filteredOptions}
                    keyExtractor={(option) => `${typeof option.value}:${String(option.value)}`}
                    keyboardShouldPersistTaps="handled"
                    className="shrink"
                    contentContainerClassName="px-3 pb-3"
                    renderItem={({ item }) => {
                      const isSelected = item.value === value;
                      return (
                        <Pressable
                          onPress={() => {
                            onChange(item.value);
                            close();
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={item.label}
                          accessibilityState={{ selected: isSelected }}
                          className={`my-0.5 min-h-14 flex-row items-center rounded-2xl px-4 py-3 ${
                            isSelected ? 'bg-blue-50' : 'active:bg-slate-100'
                          }`}
                        >
                          <Text
                            className={`flex-1 text-base ${
                              isSelected ? 'font-semibold text-blue-700' : 'font-medium text-slate-800'
                            }`}
                          >
                            {item.label}
                          </Text>
                          {isSelected ? <Ionicons name="checkmark-circle" size={22} color="#2563eb" /> : null}
                        </Pressable>
                      );
                    }}
                    ListEmptyComponent={
                      <View className="items-center px-6 py-10">
                        {loading ? (
                          <>
                            <ActivityIndicator size="small" color="#2563eb" />
                            <Text className="mt-3 text-sm text-slate-500">Loading options…</Text>
                          </>
                        ) : loadError ? (
                          <>
                            <Ionicons name="cloud-offline-outline" size={28} color="#94a3b8" />
                            <Text className="mt-3 text-center text-sm text-slate-500">{loadError}</Text>
                            {onRetry ? (
                              <Pressable
                                onPress={onRetry}
                                accessibilityRole="button"
                                className="mt-3 min-h-12 justify-center rounded-xl bg-blue-50 px-5"
                              >
                                <Text className="font-semibold text-blue-700">Try again</Text>
                              </Pressable>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <Ionicons name="search-outline" size={28} color="#94a3b8" />
                            <Text className="mt-3 text-center text-sm text-slate-500">
                              {normalizedQuery ? `No results for “${query.trim()}”` : emptyMessage}
                            </Text>
                          </>
                        )}
                      </View>
                    }
                  />
                </SafeAreaView>
              </KeyboardAvoidingView>
            </Modal>
          </View>
        );
      }}
    />
  );
};
