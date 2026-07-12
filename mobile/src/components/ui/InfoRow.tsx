import { Text, View } from 'react-native';

export const InfoRow = ({ label, value }: { label: string; value?: string | null }) =>
  !value ? null : (
    <View className="flex-row justify-between border-b border-slate-100 py-2.5">
      <Text className="text-sm text-slate-500">{label}</Text>
      <Text className="ml-4 flex-1 text-right text-sm font-medium text-slate-800">{value}</Text>
    </View>
  );
