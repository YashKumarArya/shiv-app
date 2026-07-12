import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';

const items = [
  { title: 'Designations', subtitle: 'Roles & default salaries', icon: 'ribbon-outline', href: '/designations' },
  { title: 'Locations', subtitle: 'Client sites', icon: 'business-outline', href: '/locations' },
  { title: 'Assignments', subtitle: 'Employee site postings', icon: 'swap-horizontal-outline', href: '/assignments' },
  { title: 'Payments', subtitle: 'Salary records & proofs', icon: 'cash-outline', href: '/payments' },
  { title: 'Documents', subtitle: 'Employee documents', icon: 'document-text-outline', href: '/documents' },
  { title: 'Uniforms', subtitle: 'Issue & return tracking', icon: 'shirt-outline', href: '/uniforms' },
  { title: 'Settings', subtitle: 'Profile & password', icon: 'settings-outline', href: '/settings' },
] as const;

export default function More() {
  const router = useRouter();
  return (
    <Screen scroll>
      {items.map((item) => (
        <Pressable
          key={item.href}
          onPress={() => router.push(item.href as Href)}
          className="mb-3 flex-row items-center rounded-2xl bg-white p-4 shadow-sm active:opacity-80"
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-blue-50">
            <Ionicons name={item.icon} size={20} color="#2563eb" />
          </View>
          <View className="ml-3 flex-1">
            <Text className="font-semibold text-slate-800">{item.title}</Text>
            <Text className="text-xs text-slate-500">{item.subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
        </Pressable>
      ))}
    </Screen>
  );
}
