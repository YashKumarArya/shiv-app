import { Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { useAuth } from '@/providers/AuthProvider';

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) return <ActivityIndicator className="flex-1 bg-slate-50" />;
  return <Redirect href={user ? '/(app)/(tabs)' : '/login'} />;
}
