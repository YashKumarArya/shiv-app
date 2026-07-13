import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBackground, type BackgroundVariant } from './AppBackground';
import { depth } from './depth';

interface Props {
  children?: ReactNode;
  scroll?: boolean;
  className?: string;
  safeTop?: boolean;
  footer?: ReactNode;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  backgroundVariant?: BackgroundVariant;
}

export const Screen = ({
  children, scroll, className = '', safeTop = false, footer, loading, error, onRetry,
  backgroundVariant = 'default',
}: Props) => {
  const insets = useSafeAreaInsets();
  const Container = safeTop ? SafeAreaView : View;

  if (loading) {
    return (
      <Container className="flex-1 items-center justify-center bg-transparent">
        <AppBackground variant={backgroundVariant} />
        <ActivityIndicator color="#2457d6" />
        <Text className="mt-3 text-sm font-medium text-slate-500">Loading details…</Text>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="flex-1 items-center justify-center bg-transparent px-6">
        <AppBackground variant={backgroundVariant} />
        <View style={depth.raised} className="w-full max-w-[420px] items-center rounded-3xl border border-red-100 bg-white p-8">
          <Text className="text-base font-extrabold text-slate-800">Couldn’t load this record</Text>
          <Text className="mt-1 text-center text-sm leading-5 text-slate-500">{error}</Text>
          {onRetry ? (
            <Pressable
              onPress={onRetry}
              accessibilityRole="button"
              className="mt-5 min-h-12 justify-center rounded-xl bg-brand-50 px-5"
            >
              <Text className="font-bold text-brand-600">Try again</Text>
            </Pressable>
          ) : null}
        </View>
      </Container>
    );
  }

  if (!scroll) {
    return (
      <Container className={`flex-1 bg-transparent ${className}`}>
        <AppBackground variant={backgroundVariant} />
        {children}
      </Container>
    );
  }

  return (
    <Container className="flex-1 bg-transparent">
      <AppBackground variant={backgroundVariant} />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={safeTop ? 0 : 72}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName={`p-4 ${className}`}
          contentContainerStyle={{
            paddingBottom: footer ? 24 : Math.max(insets.bottom + 32, 48),
            flexGrow: 1,
          }}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {footer ? (
          <View
            className="border-t border-slate-200 bg-white/95 px-4 pt-3"
            style={[depth.chrome, { paddingBottom: Math.max(insets.bottom, 12) }]}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Container>
  );
};
