import { Text, View } from 'react-native';

const tones: Record<string, [string, string]> = {
  Active: ['bg-green-100', 'text-green-700'],
  Present: ['bg-green-100', 'text-green-700'],
  Returned: ['bg-green-100', 'text-green-700'],
  Inactive: ['bg-red-100', 'text-red-700'],
  Absent: ['bg-red-100', 'text-red-700'],
  'Half Day': ['bg-amber-100', 'text-amber-700'],
  Leave: ['bg-blue-100', 'text-blue-700'],
  Issued: ['bg-blue-100', 'text-blue-700'],
};

export const Badge = ({ label }: { label: string }) => {
  const [bg, text] = tones[label] ?? ['bg-slate-100', 'text-slate-600'];
  return (
    <View className={`rounded-full px-2.5 py-1 ${bg}`}>
      <Text className={`text-xs font-medium ${text}`}>{label}</Text>
    </View>
  );
};
