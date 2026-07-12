import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

export const EmptyState = ({ message = 'Nothing here yet' }: { message?: string }) => (
  <View className="mt-16 items-center">
    <Ionicons name="file-tray-outline" size={40} color="#cbd5e1" />
    <Text className="mt-2 text-slate-400">{message}</Text>
  </View>
);
