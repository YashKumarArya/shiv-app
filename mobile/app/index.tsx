import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { AppBackground } from '@/components/ui/AppBackground';
import { useAuth } from '@/providers/AuthProvider';

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <AppBackground />
        <ActivityIndicator color="#2457d6" />
      </View>
    );
  }
  return <Redirect href={user ? '/(app)/(tabs)' : '/login'} />;
}
