import { Stack } from 'expo-router';

const screens: [name: string, title: string][] = [
  ['patrol/scan', 'Scan Checkpoint'],
  ['patrol/round', 'Patrol Round'],
];

export default function SelfLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: '#f6f0ff' },
        headerStyle: { backgroundColor: '#fff8ed' },
        headerShadowVisible: false,
        headerTintColor: '#2457d6',
        headerBackButtonDisplayMode: 'generic',
        headerBackTitle: 'Back',
        headerTitleStyle: { color: '#102a43', fontSize: 17, fontWeight: '700' },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {screens.map(([name, title]) => (
        <Stack.Screen key={name} name={name} options={{ title }} />
      ))}
    </Stack>
  );
}
