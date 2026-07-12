import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Switch, Text, View } from 'react-native';

interface Props<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
}

export const FormSwitch = <T extends FieldValues>({ control, name, label }: Props<T>) => (
  <Controller
    control={control}
    name={name}
    render={({ field: { onChange, value } }) => (
      <View className="mb-3 flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <Text className="text-sm font-medium text-slate-600">{label}</Text>
        <Switch value={!!value} onValueChange={onChange} trackColor={{ true: '#2563eb' }} />
      </View>
    )}
  />
);
