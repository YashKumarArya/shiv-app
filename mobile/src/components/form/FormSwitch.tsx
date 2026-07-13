import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Pressable, Switch, Text, View } from 'react-native';
import { depth } from '@/components/ui/depth';

interface Props<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  helperText?: string;
  disabled?: boolean;
}

export const FormSwitch = <T extends FieldValues>({
  control,
  name,
  label,
  helperText,
  disabled = false,
}: Props<T>) => (
  <Controller
    control={control}
    name={name}
    render={({ field: { onChange, value }, fieldState: { error } }) => {
      const checked = Boolean(value);

      return (
        <View className="mb-4">
          <Pressable
            onPress={() => onChange(!checked)}
            disabled={disabled}
            accessibilityRole="switch"
            accessibilityLabel={label}
            accessibilityHint={helperText ?? `Turns ${label.toLocaleLowerCase()} ${checked ? 'off' : 'on'}`}
            accessibilityState={{ checked, disabled }}
            style={depth.subtle}
            className={`min-h-14 flex-row items-center justify-between rounded-2xl border bg-white px-4 py-3 ${
              error ? 'border-red-400' : 'border-slate-200'
            } ${disabled ? 'opacity-60' : 'active:bg-slate-50'}`}
          >
            <View className="mr-4 flex-1">
              <Text className="text-sm font-semibold text-slate-700">{label}</Text>
              {helperText ? <Text className="mt-0.5 text-xs text-slate-500">{helperText}</Text> : null}
            </View>
            <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Switch
                value={checked}
                disabled={disabled}
                trackColor={{ false: '#cbd5e1', true: '#2563eb' }}
                thumbColor="#ffffff"
              />
            </View>
          </Pressable>
          {error ? (
            <Text accessibilityLiveRegion="polite" className="mt-1.5 text-xs font-medium text-red-600">
              {error.message}
            </Text>
          ) : null}
        </View>
      );
    }}
  />
);
