import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { fileUrl } from '@/api/client';
import { employeeName, type Employee } from '@/api/types';
import { ResourceList } from '@/components/ResourceList';
import { ListCard } from '@/components/ui/ListCard';
import { Screen } from '@/components/ui/Screen';

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
            className="h-12 w-12 rounded-2xl border border-white bg-slate-100 shadow-sm"
          />
        ) : (
          <View className="h-12 w-12 items-center justify-center rounded-2xl border border-white bg-brand-50 shadow-sm">
            <Text className="text-base font-bold text-brand-700">{employeeInitials(employee) || '—'}</Text>
          </View>
        )
      }
    />
  );
}

export default function Employees() {
  const [status, setStatus] = useState<'All' | Employee['status']>('All');

  return (
    <Screen>
      <View className="flex-row gap-2 px-4 pt-3">
        {(['All', 'Active', 'Inactive'] as const).map((option) => {
          const selected = status === option;
          return (
            <Pressable
              key={option}
              onPress={() => setStatus(option)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`min-h-12 justify-center rounded-full border px-4 ${
                selected ? 'border-brand-600 bg-brand-600 shadow-sm' : 'border-slate-200 bg-white'
              }`}
            >
              <Text className={`text-sm font-bold ${selected ? 'text-white' : 'text-slate-600'}`}>{option}</Text>
            </Pressable>
          );
        })}
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
