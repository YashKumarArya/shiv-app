import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { depth } from './depth';

const variants = {
  primary: ['bg-brand-600 border-brand-600', 'text-white', 'white'],
  secondary: ['bg-white border-slate-200', 'text-slate-800', '#334155'],
  danger: ['bg-red-50 border-red-100', 'text-red-700', '#b91c1c'],
  ghost: ['bg-transparent border-transparent', 'text-brand-600', '#2457d6'],
} as const;

interface Props {
  title: string;
  onPress: () => void;
  variant?: keyof typeof variants;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

export const Button = ({ title, onPress, variant = 'primary', loading, disabled, icon }: Props) => {
  const [container, text, iconColor] = variants[variant];
  const unavailable = !!disabled || !!loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={unavailable}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: unavailable, busy: !!loading }}
      style={variant === 'primary' ? depth.subtle : undefined}
      className={`min-h-[52px] flex-row items-center justify-center rounded-2xl border px-5 py-3.5 ${container} ${unavailable ? 'opacity-50' : 'active:opacity-80'}`}
    >
      {loading ? (
        <ActivityIndicator color={iconColor} />
      ) : (
        <View className="min-w-0 flex-row items-center justify-center gap-2">
          {icon ? <Ionicons name={icon} size={18} color={iconColor} /> : null}
          <Text className={`shrink text-center text-[15px] font-bold ${text}`}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
};
