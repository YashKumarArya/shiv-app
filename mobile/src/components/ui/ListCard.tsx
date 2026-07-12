import { useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge } from './Badge';

interface Props {
  title: string;
  subtitle?: string;
  badge?: string;
  right?: ReactNode;
  href?: string;
  onPress?: () => void;
}

export const ListCard = ({ title, subtitle, badge, right, href, onPress }: Props) => {
  const router = useRouter();
  const handlePress = onPress ?? (href ? () => router.push(href as Href) : undefined);
  return (
    <Pressable
      onPress={handlePress}
      disabled={!handlePress}
      className="mb-3 flex-row items-center rounded-2xl bg-white p-4 shadow-sm active:opacity-80"
    >
      <View className="flex-1 pr-3">
        <Text className="text-base font-semibold text-slate-800">{title}</Text>
        {subtitle ? <Text className="mt-0.5 text-sm text-slate-500">{subtitle}</Text> : null}
      </View>
      {right ?? (badge ? <Badge label={badge} /> : null)}
    </Pressable>
  );
};
