import { Text, View } from 'react-native';

const tones: Record<string, [string, string, string]> = {
  active: ['bg-emerald-50 border-emerald-100', 'text-emerald-700', 'bg-emerald-500'],
  present: ['bg-emerald-50 border-emerald-100', 'text-emerald-700', 'bg-emerald-500'],
  returned: ['bg-emerald-50 border-emerald-100', 'text-emerald-700', 'bg-emerald-500'],
  inactive: ['bg-red-50 border-red-100', 'text-red-700', 'bg-red-500'],
  absent: ['bg-red-50 border-red-100', 'text-red-700', 'bg-red-500'],
  'half day': ['bg-amber-50 border-amber-100', 'text-amber-700', 'bg-amber-500'],
  leave: ['bg-blue-50 border-blue-100', 'text-blue-700', 'bg-blue-500'],
  issued: ['bg-blue-50 border-blue-100', 'text-blue-700', 'bg-blue-500'],
  admin: ['bg-violet-50 border-violet-100', 'text-violet-700', 'bg-violet-500'],
  'office staff': ['bg-slate-50 border-slate-200', 'text-slate-600', 'bg-slate-400'],
};

export const Badge = ({ label }: { label: string }) => {
  const [container, text, dot] = tones[label.toLowerCase()] ?? [
    'bg-slate-50 border-slate-200', 'text-slate-600', 'bg-slate-400',
  ];
  return (
    <View className={`flex-row items-center gap-1.5 rounded-full border px-2.5 py-1 ${container}`}>
      <View className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <Text className={`text-xs font-semibold ${text}`}>{label}</Text>
    </View>
  );
};
