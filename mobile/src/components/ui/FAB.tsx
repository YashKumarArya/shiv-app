import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, Text, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { depth } from './depth';

export const FAB = ({
  href,
  label = 'Add',
  withinTab = false,
}: {
  href: string;
  label?: string;
  withinTab?: boolean;
}) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(href as Href)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        depth.floating,
        {
          position: 'absolute',
          bottom: withinTab ? 16 : Math.max(insets.bottom, 12) + 12,
          right: 16,
          minWidth: 140,
          maxWidth: Math.max(width - 32, 140),
          minHeight: 56,
          zIndex: 50,
        },
      ]}
      className="flex-row items-center justify-center rounded-2xl bg-brand-600 px-4 active:opacity-80"
    >
      <Ionicons name="add" size={22} color="white" />
      <Text numberOfLines={2} className="ml-2 shrink text-center font-bold text-white">{label}</Text>
    </Pressable>
  );
};
