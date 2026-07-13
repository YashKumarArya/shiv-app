import { useId, useState } from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { depth } from '@/components/ui/depth';

interface Props<T extends FieldValues> extends TextInputProps {
  control: Control<T>;
  name: Path<T>;
  label: string;
  helperText?: string;
}

export const FormField = <T extends FieldValues>({
  control,
  name,
  label,
  helperText,
  multiline,
  editable = true,
  onBlur: inputOnBlur,
  onFocus: inputOnFocus,
  className,
  ...inputProps
}: Props<T>) => {
  const [focused, setFocused] = useState(false);
  const generatedId = useId().replace(/:/g, '');
  const inputId = `field-${generatedId}`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
        <View className="mb-4">
          <Text nativeID={`${inputId}-label`} className="mb-2 text-sm font-semibold text-slate-700">
            {label}
          </Text>
          <TextInput
            {...inputProps}
            nativeID={inputId}
            value={value == null ? '' : String(value)}
            onChangeText={onChange}
            onBlur={(event) => {
              setFocused(false);
              onBlur();
              inputOnBlur?.(event);
            }}
            onFocus={(event) => {
              setFocused(true);
              inputOnFocus?.(event);
            }}
            multiline={multiline}
            editable={editable}
            textAlignVertical={multiline ? 'top' : 'center'}
            placeholderTextColor="#94a3b8"
            selectionColor="#2563eb"
            accessibilityLabel={label}
            accessibilityHint={helperText}
            accessibilityState={{ disabled: !editable }}
            style={focused ? depth.subtle : undefined}
            className={`min-h-12 rounded-2xl border bg-white px-4 text-base text-slate-900 ${
              multiline ? 'min-h-28 py-3' : 'py-3'
            } ${
              error
                ? 'border-red-400'
                : focused
                  ? 'border-blue-500'
                  : 'border-slate-200'
            } ${editable ? '' : 'bg-slate-100 text-slate-500'} ${className ?? ''}`}
          />
          {error ? (
            <Text
              nativeID={`${inputId}-error`}
              accessibilityLiveRegion="polite"
              className="mt-1.5 text-xs font-medium text-red-600"
            >
              {error.message}
            </Text>
          ) : helperText ? (
            <Text className="mt-1.5 text-xs text-slate-500">{helperText}</Text>
          ) : null}
        </View>
      )}
    />
  );
};
