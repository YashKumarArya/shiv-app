import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge } from './Badge';
import { depth } from './depth';

interface Props {
  title: string;
  subtitle?: string;
  badge?: string;
  leading?: ReactNode;
  right?: ReactNode;
  href?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export const ListCard = ({
  title, subtitle, badge, leading, right, href, onPress, accessibilityLabel,
}: Props) => {
  const router = useRouter();
  const handlePress = onPress ?? (href ? () => router.push(href as Href) : undefined);
  return (
    <Pressable
      onPress={handlePress}
      disabled={!handlePress}
      accessibilityRole={handlePress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, badge].filter(Boolean).join(', ')}
      style={depth.subtle}
      className="mb-3 min-h-[76px] flex-row items-center rounded-2xl border border-slate-200 bg-white p-3.5 active:bg-slate-50"
    >
      {leading ? <View className="mr-3">{leading}</View> : null}
      <View className="min-w-0 flex-1 pr-2">
        <Text className="text-[15px] font-bold text-slate-800" numberOfLines={2}>{title}</Text>
        {subtitle ? <Text className="mt-1 text-[13px] leading-[18px] text-slate-500" numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right ?? (badge ? <Badge label={badge} /> : null)}
      {handlePress ? (
        <Ionicons name="chevron-forward" size={16} color="#b0bccb" style={{ marginLeft: 6 }} />
      ) : null}
    </Pressable>
  );
};
