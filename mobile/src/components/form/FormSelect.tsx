import { useState } from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';

export interface Option {
  label: string;
  value: string | number;
}

export const toOptions = (values: readonly string[]): Option[] =>
  values.map((value) => ({ label: value, value }));

interface Props<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  options: Option[];
  placeholder?: string;
}

export const FormSelect = <T extends FieldValues>({
  control, name, label, options, placeholder = 'Select…',
}: Props<T>) => {
  const [open, setOpen] = useState(false);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value }, fieldState: { error } }) => {
        const selected = options.find((option) => option.value === value);
        return (
          <View className="mb-3">
            <Text className="mb-1 text-sm font-medium text-slate-600">{label}</Text>
            <Pressable
              onPress={() => setOpen(true)}
              className={`rounded-xl border bg-white px-3 py-3 ${error ? 'border-red-400' : 'border-slate-200'}`}
            >
              <Text className={selected ? 'text-slate-800' : 'text-slate-400'}>
                {selected?.label ?? placeholder}
              </Text>
            </Pressable>
            {error ? <Text className="mt-1 text-xs text-red-500">{error.message}</Text> : null}

            <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
              <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setOpen(false)}>
                <View className="max-h-[60%] rounded-t-3xl bg-white p-4">
                  <Text className="mb-2 text-center text-base font-semibold text-slate-800">{label}</Text>
                  <FlatList
                    data={options}
                    keyExtractor={(option) => String(option.value)}
                    renderItem={({ item }) => (
                      <Pressable
                        onPress={() => {
                          onChange(item.value);
                          setOpen(false);
                        }}
                        className={`rounded-xl px-3 py-3 ${item.value === value ? 'bg-blue-50' : ''}`}
                      >
                        <Text className="text-slate-800">{item.label}</Text>
                      </Pressable>
                    )}
                  />
                </View>
              </Pressable>
            </Modal>
          </View>
        );
      }}
    />
  );
};
