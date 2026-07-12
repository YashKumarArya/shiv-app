import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { addDays, formatDate } from '@/lib/format';

interface Props {
  value: string;
  onChange: (date: string) => void;
}

export const DateStepper = ({ value, onChange }: Props) => (
  <View className="mx-4 mt-4 flex-row items-center justify-between rounded-xl bg-white px-2 py-1.5 shadow-sm">
    <Pressable onPress={() => onChange(addDays(value, -1))} className="p-2">
      <Ionicons name="chevron-back" size={20} color="#2563eb" />
    </Pressable>
    <Text className="font-semibold text-slate-800">{formatDate(value)}</Text>
    <Pressable onPress={() => onChange(addDays(value, 1))} className="p-2">
      <Ionicons name="chevron-forward" size={20} color="#2563eb" />
    </Pressable>
  </View>
);
