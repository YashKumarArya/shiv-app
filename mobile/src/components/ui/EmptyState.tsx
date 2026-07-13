import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { depth } from './depth';

interface Props {
  title?: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  action?: ReactNode;
}

export const EmptyState = ({
  title = 'Nothing here yet',
  message = 'New records will appear here.',
  icon = 'file-tray-outline',
  action,
}: Props) => (
  <View style={depth.raised} className="mx-4 mt-12 items-center rounded-3xl border border-slate-200 bg-white px-6 py-10">
    <View className="h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
      <Ionicons name={icon} size={27} color="#7b8ba1" />
    </View>
    <Text className="mt-4 text-base font-bold text-slate-800">{title}</Text>
    <Text className="mt-1 max-w-[260px] text-center text-sm leading-5 text-slate-500">{message}</Text>
    {action ? <View className="mt-4">{action}</View> : null}
  </View>
);
