import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

// Matches the office app: some Android edge-to-edge/three-button combinations
// report a zero bottom inset during first layout.
const ANDROID_NAVIGATION_BAR_FALLBACK = 48;

const tab = (
  title: string,
  outlineIcon: keyof typeof Ionicons.glyphMap,
  filledIcon: keyof typeof Ionicons.glyphMap,
) => ({
  title,
  tabBarIcon: ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? filledIcon : outlineIcon} color={color} size={size} />
  ),
});

export default function SelfTabsLayout() {
  const insets = useSafeAreaInsets();
  const measuredBottomInset = Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0);
  const bottomInset = Platform.OS === 'android'
    ? Math.max(measuredBottomInset, ANDROID_NAVIGATION_BAR_FALLBACK)
    : measuredBottomInset;

  return (
    <Tabs
      safeAreaInsets={{ bottom: bottomInset }}
      screenOptions={{
        sceneStyle: { backgroundColor: '#f6f0ff' },
        headerStyle: { backgroundColor: '#fff8ed' },
        headerShadowVisible: false,
        headerTitleAlign: 'left',
        headerTitleStyle: { color: '#102a43', fontSize: 22, fontWeight: '800' },
        tabBarActiveTintColor: '#2457d6',
        tabBarInactiveTintColor: '#7b8ba1',
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 0,
          paddingTop: 8,
          shadowColor: '#102a43',
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.1,
          shadowRadius: 18,
          elevation: 12,
        },
      }}
    >
      <Tabs.Screen name="index" options={tab('Patrol', 'shield-outline', 'shield')} />
      <Tabs.Screen name="attendance" options={tab('Attendance', 'calendar-outline', 'calendar')} />
      <Tabs.Screen name="salary" options={tab('Salary', 'wallet-outline', 'wallet')} />
      <Tabs.Screen name="profile" options={tab('Profile', 'person-outline', 'person')} />
    </Tabs>
  );
}
