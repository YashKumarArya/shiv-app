import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

const tab = (title: string, icon: keyof typeof Ionicons.glyphMap) => ({
  title,
  tabBarIcon: ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={icon} color={color} size={size} />
  ),
});

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#2563eb', headerTitleStyle: { color: '#1e293b' } }}>
      <Tabs.Screen name="index" options={tab('Dashboard', 'grid-outline')} />
      <Tabs.Screen name="employees" options={tab('Employees', 'people-outline')} />
      <Tabs.Screen name="attendance" options={tab('Attendance', 'calendar-outline')} />
      <Tabs.Screen name="more" options={tab('More', 'menu-outline')} />
    </Tabs>
  );
}
