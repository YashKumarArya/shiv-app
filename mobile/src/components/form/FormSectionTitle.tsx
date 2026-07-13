import { Text, View } from 'react-native';

export const FormSectionTitle = ({ title, description }: { title: string; description?: string }) => (
  <View className="mb-3 mt-2 px-1">
    <Text className="text-xs font-extrabold uppercase tracking-[1.1px] text-brand-600">{title}</Text>
    {description ? <Text className="mt-1 text-sm leading-5 text-slate-500">{description}</Text> : null}
  </View>
);
