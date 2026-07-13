import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';

type MenuItem = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
  tone: string;
  iconColor: string;
};

const groups: { title: string; items: MenuItem[] }[] = [
  {
    title: 'Workforce',
    items: [
      {
        title: 'Designations',
        subtitle: 'Roles and salary defaults',
        icon: 'ribbon-outline',
        href: '/designations',
        tone: 'bg-violet-50',
        iconColor: '#7c3aed',
      },
      {
        title: 'Locations',
        subtitle: 'Client sites and contacts',
        icon: 'business-outline',
        href: '/locations',
        tone: 'bg-cyan-50',
        iconColor: '#0891b2',
      },
      {
        title: 'Assignments',
        subtitle: 'Employee site postings',
        icon: 'swap-horizontal-outline',
        href: '/assignments',
        tone: 'bg-brand-50',
        iconColor: '#2457d6',
      },
    ],
  },
  {
    title: 'Records',
    items: [
      {
        title: 'Salary tracking',
        subtitle: 'Paid, partial and outstanding salaries',
        icon: 'wallet-outline',
        href: '/payments',
        tone: 'bg-emerald-50',
        iconColor: '#059669',
      },
      {
        title: 'Documents',
        subtitle: 'Employee identity files',
        icon: 'document-text-outline',
        href: '/documents',
        tone: 'bg-amber-50',
        iconColor: '#d97706',
      },
      {
        title: 'Uniforms',
        subtitle: 'Issue and return tracking',
        icon: 'shirt-outline',
        href: '/uniforms',
        tone: 'bg-rose-50',
        iconColor: '#e11d48',
      },
    ],
  },
  {
    title: 'Account',
    items: [
      {
        title: 'Settings',
        subtitle: 'Profile, security and sign out',
        icon: 'settings-outline',
        href: '/settings',
        tone: 'bg-slate-100',
        iconColor: '#475569',
      },
    ],
  },
];

export default function More() {
  const router = useRouter();

  return (
    <Screen scroll className="pt-2">
      <View className="mb-5 px-1">
        <Text className="text-sm leading-5 text-slate-500">
          Workforce setup, records and account controls.
        </Text>
      </View>

      {groups.map((group) => (
        <View key={group.title} className="mb-5">
          <Text className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
            {group.title}
          </Text>
          <View className="rounded-2xl shadow-sm">
            <View className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
              {group.items.map((item, index) => (
                <Pressable
                  key={item.title}
                  onPress={() => router.push(item.href)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}, ${item.subtitle}`}
                  className={`flex-row items-center px-3.5 py-3 active:bg-slate-50 ${
                    index < group.items.length - 1 ? 'border-b border-slate-100' : ''
                  }`}
                >
                  <View className={`h-10 w-10 items-center justify-center rounded-xl ${item.tone}`}>
                    <Ionicons name={item.icon} size={20} color={item.iconColor} />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="font-semibold text-slate-900">{item.title}</Text>
                    <Text className="mt-0.5 text-xs text-slate-500">{item.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color="#94a3b8" />
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      ))}
    </Screen>
  );
}
