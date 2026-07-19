import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image, Pressable, Text, View } from 'react-native';
import { fileUrl } from '@/api/client';
import { employeeName, type Employee } from '@/api/types';
import { ResourceList } from '@/components/ResourceList';
import { ListCard } from '@/components/ui/ListCard';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';

const employeeInitials = (employee: Employee) =>
  [employee.first_name, employee.last_name]
    .filter(Boolean)
    .map((name) => name?.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

function EmployeeCard({ employee }: { employee: Employee }) {
  return (
    <ListCard
      title={employeeName(employee)}
      subtitle={`${employee.designation_name || 'No designation'} · ${employee.employee_code}`}
      badge={employee.status}
      href={`/employees/${employee.id}`}
      leading={
        employee.photo ? (
          <Image
            source={{ uri: fileUrl(employee.photo) }}
            style={depth.subtle}
            className="h-12 w-12 rounded-2xl border border-white bg-slate-100"
          />
        ) : (
          <View
            style={depth.subtle}
            className="h-12 w-12 items-center justify-center rounded-2xl border border-white bg-brand-50"
          >
            <Text className="text-base font-bold text-brand-700">{employeeInitials(employee) || '—'}</Text>
          </View>
        )
      }
    />
  );
}

export default function Employees() {
  const router = useRouter();
  const [status, setStatus] = useState<'All' | Employee['status']>('All');

  return (
    <Screen>
      <View className="flex-row flex-wrap gap-2 px-4 pt-3">
        {(['All', 'Active', 'Inactive'] as const).map((option) => {
          const selected = status === option;
          return (
            <Pressable
              key={option}
              onPress={() => setStatus(option)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={selected ? depth.subtle : undefined}
              className={`min-h-12 justify-center rounded-full border px-4 ${
                selected ? 'border-brand-600 bg-brand-600' : 'border-slate-200 bg-white'
              }`}
            >
              <Text className={`text-sm font-bold ${selected ? 'text-white' : 'text-slate-600'}`}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
      <View className="items-end px-4 pt-2">
        <Pressable
          onPress={() => router.push('/employees/id-card-sheet')}
          accessibilityRole="button"
          accessibilityLabel="Select and print multiple employee ID cards"
          className="min-h-11 flex-row items-center justify-center rounded-xl px-3 active:bg-brand-50"
        >
          <Ionicons name="print-outline" size={17} color="#2457d6" />
          <Text className="ml-1.5 text-sm font-bold text-brand-600">Print ID cards</Text>
        </Pressable>
      </View>
      <ResourceList<Employee>
        resource="employees"
        params={{ status: status === 'All' ? undefined : status }}
        searchable
        addHref="/employees/form"
        addLabel="Add employee"
        emptyTitle="No employees yet"
        emptyMessage="Add your first employee to start managing attendance and assignments."
        fabWithinTab
        renderItem={(employee) => <EmployeeCard employee={employee} />}
      />
    </Screen>
  );
}
