import { Stack } from 'expo-router';

const screens: [name: string, title: string][] = [
  ['employees/[id]', 'Employee Details'],
  ['employees/form', 'Employee'],
  ['employees/id-card', 'ID Card'],
  ['designations/index', 'Designations'],
  ['designations/form', 'Designation'],
  ['locations/index', 'Locations'],
  ['locations/form', 'Location'],
  ['assignments/index', 'Assignments'],
  ['assignments/form', 'Assign Employee'],
  ['attendance/mark', 'Attendance'],
  ['attendance/[employeeId]', 'Work Calendar'],
  ['payments/index', 'Salary Tracking'],
  ['payments/history', 'Payment History'],
  ['payments/form', 'Record Payment'],
  ['payments/reverse', 'Reverse Payment'],
  ['documents/index', 'Documents'],
  ['documents/form', 'Document'],
  ['uniforms/index', 'Uniforms'],
  ['uniforms/form', 'Issue Uniform'],
  ['settings', 'Settings'],
];

export default function AppLayout() {
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
