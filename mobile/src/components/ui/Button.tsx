import { ActivityIndicator, Pressable, Text } from 'react-native';

const variants = {
  primary: ['bg-blue-600', 'text-white'],
  secondary: ['bg-slate-200', 'text-slate-800'],
  danger: ['bg-red-600', 'text-white'],
} as const;

interface Props {
  title: string;
  onPress: () => void;
  variant?: keyof typeof variants;
  loading?: boolean;
  disabled?: boolean;
}

export const Button = ({ title, onPress, variant = 'primary', loading, disabled }: Props) => {
  const [bg, text] = variants[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={`items-center rounded-xl px-4 py-3.5 ${bg} ${disabled || loading ? 'opacity-60' : 'active:opacity-80'}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? '#1e293b' : 'white'} />
      ) : (
        <Text className={`font-semibold ${text}`}>{title}</Text>
      )}
    </Pressable>
  );
};
