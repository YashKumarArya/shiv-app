import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { createElement, useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { depth } from '@/components/ui/depth';
import { addDays, formatDate, today } from '@/lib/format';

interface Props {
  value: string;
  onChange: (date: string) => void;
  /** Names what the date selects, for screens other than attendance. */
  label?: string;
}

const localDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
};

const localDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const DateStepper = ({ value, onChange, label = 'Attendance date' }: Props) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(() => localDate(value));
  const previousDate = addDays(value, -1);
  const nextDate = addDays(value, 1);
  const isToday = value === today();
  const nextDisabled = value >= today();
  const maximumDate = localDate(today());

  const openPicker = () => {
    setDraftDate(localDate(value));
    setPickerOpen(true);
  };

  const closePicker = () => setPickerOpen(false);

  const handleAndroidChange = (event: DateTimePickerEvent, nextValue?: Date) => {
    closePicker();
    if (event.type === 'set' && nextValue) onChange(localDateString(nextValue));
  };

  const dateContent = (
    <>
      <View className="max-w-full flex-row items-center">
        <Ionicons name="calendar-outline" size={14} color="#64748b" />
        <Text className="ml-1.5 shrink text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </Text>
      </View>
      <View className="mt-0.5 max-w-full flex-row flex-wrap items-center justify-center">
        <Text className="shrink text-center text-base font-bold text-slate-900">
          {formatDate(value)}
        </Text>
        {isToday ? (
          <View className="ml-2 rounded-full bg-blue-50 px-2 py-0.5">
            <Text className="text-[10px] font-bold uppercase text-blue-700">Today</Text>
          </View>
        ) : null}
      </View>
    </>
  );

  return (
    <>
      <View className="mx-4 mt-4 flex-row items-center rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <Pressable
          onPress={() => onChange(previousDate)}
          className="h-12 w-12 items-center justify-center rounded-xl bg-slate-50 active:bg-slate-100"
          accessibilityRole="button"
          accessibilityLabel={`Previous day, ${formatDate(previousDate)}`}
          hitSlop={4}
        >
          <Ionicons name="chevron-back" size={21} color="#334155" />
        </Pressable>

        {Platform.OS === 'web' ? (
          <View
            className="relative min-h-12 min-w-0 flex-1 items-center justify-center rounded-xl px-2"
            accessibilityLabel={`${label}, ${formatDate(value)}${isToday ? ', today' : ''}`}
          >
            <View pointerEvents="none" className="items-center">
              {dateContent}
            </View>
            {createElement('input', {
              type: 'date',
              value,
              max: today(),
              'aria-label': `Choose ${label.toLowerCase()}, currently ${formatDate(value)}`,
              onChange: (event: { currentTarget: { value: string } }) => {
                if (event.currentTarget.value) onChange(event.currentTarget.value);
              },
              style: {
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                border: 0,
                opacity: 0,
                cursor: 'pointer',
              },
            })}
          </View>
        ) : (
          <Pressable
            onPress={openPicker}
            className="min-h-12 min-w-0 flex-1 items-center justify-center rounded-xl px-2 active:bg-slate-50"
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${formatDate(value)}${isToday ? ', today' : ''}`}
            accessibilityHint="Opens the calendar to choose another date"
            accessibilityState={{ expanded: pickerOpen }}
          >
            {dateContent}
          </Pressable>
        )}

        <Pressable
          onPress={() => onChange(nextDate)}
          disabled={nextDisabled}
          className={`h-12 w-12 items-center justify-center rounded-xl ${nextDisabled ? 'bg-slate-50 opacity-40' : 'bg-slate-50 active:bg-slate-100'}`}
          accessibilityRole="button"
          accessibilityLabel={`Next day, ${formatDate(nextDate)}`}
          accessibilityState={{ disabled: nextDisabled }}
          hitSlop={4}
        >
          <Ionicons name="chevron-forward" size={21} color={nextDisabled ? '#94a3b8' : '#334155'} />
        </Pressable>
      </View>

      {Platform.OS === 'android' && pickerOpen ? (
        <DateTimePicker
          value={draftDate}
          mode="date"
          display="calendar"
          maximumDate={maximumDate}
          onChange={handleAndroidChange}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal
          visible={pickerOpen}
          transparent
          animationType="slide"
          statusBarTranslucent
          onRequestClose={closePicker}
        >
          <View className="flex-1 justify-end">
            <Pressable
              onPress={closePicker}
              accessibilityRole="button"
              accessibilityLabel="Cancel date selection"
              className="absolute inset-0 bg-slate-950/45"
            />
            <SafeAreaView
              edges={['bottom']}
              accessibilityViewIsModal
              style={depth.chrome}
              className="rounded-t-[28px] bg-white"
            >
              <View className="mt-3 h-1.5 w-10 self-center rounded-full bg-slate-300" />
              <View className="flex-row items-center justify-between px-5 pb-2 pt-3">
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
                    onChange(localDateString(draftDate));
                    closePicker();
                  }}
                  accessibilityRole="button"
                  className="min-h-12 min-w-16 items-end justify-center"
                >
                  <Text className="text-base font-bold text-blue-600">Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={draftDate}
                mode="date"
                display="inline"
                maximumDate={maximumDate}
                themeVariant="light"
                accentColor="#2563eb"
                onChange={(_event, nextValue) => {
                  if (nextValue) setDraftDate(nextValue);
                }}
                style={{ alignSelf: 'center' }}
              />
            </SafeAreaView>
          </View>
        </Modal>
      ) : null}
    </>
  );
};
