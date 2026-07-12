import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';

const screens: [name: string, title: string][] = [
  ['employees/[id]', 'Employee Details'],
  ['employees/form', 'Employee'],
  ['designations/index', 'Designations'],
  ['designations/form', 'Designation'],
  ['locations/index', 'Locations'],
  ['locations/form', 'Location'],
  ['assignments/index', 'Assignments'],
  ['assignments/form', 'Assign Employee'],
  ['attendance/mark', 'Attendance'],
  ['payments/index', 'Payments'],
  ['payments/form', 'Record Payment'],
  ['documents/index', 'Documents'],
  ['documents/form', 'Document'],
  ['uniforms/index', 'Uniforms'],
  ['uniforms/form', 'Issue Uniform'],
  ['settings', 'Settings'],
];

export default function AppLayout() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect href="/login" />;

  return (
    <Stack screenOptions={{ headerTintColor: '#2563eb', headerTitleStyle: { color: '#1e293b' } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {screens.map(([name, title]) => (
        <Stack.Screen key={name} name={name} options={{ title }} />
      ))}
    </Stack>
  );
}
