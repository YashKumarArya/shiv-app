import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  type DateTimePickerEvent,
  type IOSNativeProps,
} from '@react-native-community/datetimepicker';
import { createElement, useState } from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { depth } from '@/components/ui/depth';

type PickerMode = 'date' | 'time';

interface Props<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  mode?: PickerMode;
  placeholder?: string;
  helperText?: string;
  disabled?: boolean;
  minimumDate?: Date;
  maximumDate?: Date;
  minuteInterval?: IOSNativeProps['minuteInterval'];
  allowClear?: boolean;
}

const pad = (value: number) => String(value).padStart(2, '0');

const storedValue = (date: Date, mode: PickerMode) =>
  mode === 'date'
    ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const parseStoredValue = (value: unknown, mode: PickerMode) => {
  const text = typeof value === 'string' ? value : '';

  if (mode === 'date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      const day = Number(match[3]);
      const parsed = new Date(year, month, day);
      if (
        parsed.getFullYear() === year &&
        parsed.getMonth() === month &&
        parsed.getDate() === day
      ) {
        return parsed;
      }
    }
  } else {
    const match = /^(\d{2}):(\d{2})$/.exec(text);
    if (match) {
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (hours > 23 || minutes > 59) return undefined;
      const parsed = new Date();
      parsed.setHours(hours, minutes, 0, 0);
      return parsed;
    }
  }

  return undefined;
};

const displayValue = (value: unknown, mode: PickerMode) => {
  if (!value) return undefined;
  const parsed = parseStoredValue(value, mode);
  if (!parsed) return String(value);

  return mode === 'date'
    ? parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : parsed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

/** A native date/time picker that stores API-friendly date or time strings in React Hook Form. */
export const DateTimeField = <T extends FieldValues>({
  control,
  name,
  label,
  mode = 'date',
  placeholder,
  helperText,
  disabled = false,
  minimumDate,
  maximumDate,
  minuteInterval,
  allowClear = false,
}: Props<T>) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(new Date());
  const fallbackPlaceholder = mode === 'date' ? 'Select date' : 'Select time';

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
        const shownValue = displayValue(value, mode);
        const showPicker = () => {
          setDraft(parseStoredValue(value, mode) ?? new Date());
          setOpen(true);
        };
        const closePicker = () => {
          setOpen(false);
          onBlur();
        };
        const commonPickerProps = {
          value: draft,
          mode,
          minimumDate,
          maximumDate,
          minuteInterval,
        };

        const handleAndroidChange = (event: DateTimePickerEvent, nextValue?: Date) => {
          setOpen(false);
          onBlur();
          if (event.type === 'set' && nextValue) onChange(storedValue(nextValue, mode));
        };

        if (Platform.OS === 'web') {
          return (
            <View className="mb-4">
              <Text className="mb-2 text-sm font-semibold text-slate-700">{label}</Text>
              <View
                style={depth.subtle}
                className={`min-h-12 justify-center rounded-2xl border bg-white px-4 ${
                  error ? 'border-red-400' : 'border-slate-200'
                } ${disabled ? 'bg-slate-100 opacity-60' : ''}`}
              >
                {createElement('input', {
                  type: mode,
                  value: typeof value === 'string' ? value : '',
                  disabled,
                  min: minimumDate ? storedValue(minimumDate, mode) : undefined,
                  max: maximumDate ? storedValue(maximumDate, mode) : undefined,
                  step: mode === 'time' && minuteInterval ? Number(minuteInterval) * 60 : undefined,
                  'aria-label': label,
                  onChange: (event: { currentTarget: { value: string } }) => onChange(event.currentTarget.value),
                  onBlur,
                  style: {
                    width: '100%',
                    minHeight: 46,
                    border: 0,
                    outline: 'none',
                    background: 'transparent',
                    color: '#0f172a',
                    fontFamily: 'inherit',
                    fontSize: 16,
                  },
                })}
              </View>
              {error ? (
                <Text accessibilityLiveRegion="polite" className="mt-1.5 text-xs font-medium text-red-600">
                  {error.message}
                </Text>
              ) : helperText ? (
                <Text className="mt-1.5 text-xs text-slate-500">{helperText}</Text>
              ) : null}
            </View>
          );
        }

        return (
          <View className="mb-4">
            <Text className="mb-2 text-sm font-semibold text-slate-700">{label}</Text>
            <Pressable
              onPress={showPicker}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${shownValue ?? placeholder ?? fallbackPlaceholder}`}
              accessibilityHint={`Opens the ${mode} picker`}
              accessibilityState={{ disabled, expanded: open }}
              style={depth.subtle}
              className={`min-h-12 flex-row items-center rounded-2xl border bg-white px-4 py-3 ${
                error ? 'border-red-400' : 'border-slate-200'
              } ${disabled ? 'bg-slate-100 opacity-60' : 'active:bg-slate-50'}`}
            >
              <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                <Ionicons
                  name={mode === 'date' ? 'calendar-outline' : 'time-outline'}
                  size={18}
                  color="#2563eb"
                />
              </View>
              <Text className={`flex-1 text-base ${shownValue ? 'font-medium text-slate-900' : 'text-slate-400'}`}>
                {shownValue ?? placeholder ?? fallbackPlaceholder}
              </Text>
              {allowClear && shownValue ? (
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    onChange('');
                    onBlur();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Clear ${label}`}
                  hitSlop={8}
                  className="h-9 w-9 items-center justify-center rounded-full active:bg-slate-100"
                >
                  <Ionicons name="close-circle" size={20} color="#94a3b8" />
                </Pressable>
              ) : (
                <Ionicons name="chevron-down" size={20} color="#64748b" />
              )}
            </Pressable>

            {error ? (
              <Text accessibilityLiveRegion="polite" className="mt-1.5 text-xs font-medium text-red-600">
                {error.message}
              </Text>
            ) : helperText ? (
              <Text className="mt-1.5 text-xs text-slate-500">{helperText}</Text>
            ) : null}

            {Platform.OS === 'android' && open ? (
              <DateTimePicker {...commonPickerProps} display="default" onChange={handleAndroidChange} />
            ) : null}

            {Platform.OS !== 'android' ? (
              <Modal
                visible={open}
                transparent
                animationType="slide"
                statusBarTranslucent
                onRequestClose={closePicker}
              >
                <View className="flex-1 justify-end">
                  <Pressable
                    onPress={closePicker}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel selection"
                    className="absolute inset-0 bg-slate-950/45"
                  />
                  <SafeAreaView
                    edges={['bottom']}
                    accessibilityViewIsModal
                    style={depth.chrome}
                    className="rounded-t-[28px] bg-white"
                  >
                    <View className="h-1.5 w-10 self-center rounded-full bg-slate-300" />
                    <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
                      <Pressable
                        onPress={closePicker}
                        accessibilityRole="button"
                        className="min-h-12 min-w-16 justify-center"
                      >
                        <Text className="text-base font-semibold text-slate-600">Cancel</Text>
                      </Pressable>
                      <Text className="text-lg font-bold text-slate-900">{label}</Text>
                      <Pressable
                        onPress={() => {
                          onChange(storedValue(draft, mode));
                          closePicker();
                        }}
                        accessibilityRole="button"
                        className="min-h-12 min-w-16 items-end justify-center"
                      >
                        <Text className="text-base font-bold text-blue-600">Done</Text>
                      </Pressable>
                    </View>
                    <DateTimePicker
                      {...commonPickerProps}
                      display="spinner"
                      themeVariant="light"
                      textColor="#0f172a"
                      accentColor="#2563eb"
                      onChange={(_event, nextValue) => {
                        if (nextValue) setDraft(nextValue);
                      }}
                      style={{ alignSelf: 'center' }}
                    />
                  </SafeAreaView>
                </View>
              </Modal>
            ) : null}
          </View>
        );
      }}
    />
  );
};
