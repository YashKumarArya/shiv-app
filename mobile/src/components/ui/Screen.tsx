import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

interface Props {
  children: ReactNode;
  scroll?: boolean;
  className?: string;
}

export const Screen = ({ children, scroll, className = '' }: Props) =>
  scroll ? (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerClassName={`p-4 pb-16 ${className}`}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View className={`flex-1 bg-slate-50 ${className}`}>{children}</View>
  );
