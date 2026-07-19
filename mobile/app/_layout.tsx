import '../global.css';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';

// Track connectivity so stale data can refresh when the device reconnects.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
);

const queryClient = new QueryClient({
  // Most screens (locations, designations, employees, documents, uniforms, payments…)
  // rarely change from outside the app, and every mutation already invalidates the
  // exact affected queries via invalidateResourceQueries. A long default staleTime
  // avoids re-fetching over the network just because a screen was revisited, while
  // still updating instantly right after any edit.
  // gcTime must outlive the persister's maxAge so restored data isn't collected.
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60_000,
      gcTime: 24 * 60 * 60_000,
      // Attempt once and show a real error instead of leaving a first-load query
      // permanently paused behind a spinner when the phone is offline.
      networkMode: 'always',
    },
    mutations: {
      retry: 0,
      // Do not retain optimistic writes in a paused queue that cannot safely
      // resume after Android kills the process. Axios fails and each mutation's
      // existing rollback/error handler restores the server-confirmed state.
      networkMode: 'always',
    },
  },
});

// Snapshot the query cache to device storage so a cold app launch renders from
// the last known data instantly while fresh data loads behind it. Logout calls
// queryClient.clear(), which also wipes this snapshot.
const persister = createAsyncStoragePersister({ storage: AsyncStorage, throttleTime: 2_000 });

function RootNavigator() {
  const { user, loading } = useAuth();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Keep the root navigator mounted while secure storage is loading. */}
      <Stack.Screen name="index" />
      <Stack.Protected guard={!loading && !!user}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!loading && !user}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // React Native has no browser window focus; map app foregrounding to
  // react-query's focus signal so stale screens refresh when the app returns
  // from the background.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
    });
    return () => subscription.remove();
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 24 * 60 * 60_000, buster: 'v1' }}
    >
      <AuthProvider>
        <StatusBar style="dark" backgroundColor="#fff8ed" />
        <RootNavigator />
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
