import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { depth } from './ui/depth';

const tones = {
  blue: ['bg-blue-100', '#2563eb'],
  green: ['bg-green-100', '#16a34a'],
  violet: ['bg-violet-100', '#7c3aed'],
  cyan: ['bg-cyan-100', '#0891b2'],
  amber: ['bg-amber-100', '#d97706'],
  red: ['bg-red-100', '#dc2626'],
} as const;

interface Props {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  tone: keyof typeof tones;
}

export const StatCard = ({ label, value, icon, tone }: Props) => {
  const [bg, color] = tones[tone];
  return (
    <View style={depth.raised} className="w-[48.5%] rounded-2xl bg-white p-4">
      <View className={`h-9 w-9 items-center justify-center rounded-full ${bg}`}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text className="mt-3 text-2xl font-bold text-slate-800">{value}</Text>
      <Text className="text-xs text-slate-500">{label}</Text>
    </View>
  );
};
