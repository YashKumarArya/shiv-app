import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

interface Props<T extends FieldValues> extends TextInputProps {
  control: Control<T>;
  name: Path<T>;
  label: string;
}

export const FormField = <T extends FieldValues>({ control, name, label, multiline, ...inputProps }: Props<T>) => (
  <Controller
    control={control}
    name={name}
    render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
      <View className="mb-3">
        <Text className="mb-1 text-sm font-medium text-slate-600">{label}</Text>
        <TextInput
          value={value == null ? '' : String(value)}
          onChangeText={onChange}
          onBlur={onBlur}
          multiline={multiline}
          placeholderTextColor="#94a3b8"
          className={`rounded-xl border bg-white px-3 py-3 text-slate-800 ${multiline ? 'min-h-[80px]' : ''} ${error ? 'border-red-400' : 'border-slate-200'}`}
          {...inputProps}
        />
        {error ? <Text className="mt-1 text-xs text-red-500">{error.message}</Text> : null}
      </View>
    )}
  />
);
