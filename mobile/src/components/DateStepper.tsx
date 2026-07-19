import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { addDays, formatDate, today } from '@/lib/format';

interface Props {
  value: string;
  onChange: (date: string) => void;
}

export const DateStepper = ({ value, onChange }: Props) => {
  const previousDate = addDays(value, -1);
  const nextDate = addDays(value, 1);
  const isToday = value === today();
  const nextDisabled = value >= today();

  return (
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

      <View className="min-w-0 flex-1 items-center px-2">
        <View className="max-w-full flex-row items-center">
          <Ionicons name="calendar-outline" size={14} color="#64748b" />
          <Text className="ml-1.5 shrink text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Attendance date
          </Text>
        </View>
        <View className="mt-0.5 max-w-full flex-row flex-wrap items-center justify-center">
          <Text
            className="shrink text-center text-base font-bold text-slate-900"
            accessibilityRole="text"
            accessibilityLabel={`Selected date, ${formatDate(value)}${isToday ? ', today' : ''}`}
          >
            {formatDate(value)}
          </Text>
          {isToday ? (
            <View className="ml-2 rounded-full bg-blue-50 px-2 py-0.5">
              <Text className="text-[10px] font-bold uppercase text-blue-700">Today</Text>
            </View>
          ) : null}
        </View>
      </View>

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
  );
};
