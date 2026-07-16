import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ActivityIndicator, Image, Linking, Pressable, Text, View } from 'react-native';
import { errorMessage, fileUrl } from '@/api/client';
import { employeeName, type Employee } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { InfoRow } from '@/components/ui/InfoRow';
import { Screen } from '@/components/ui/Screen';
import { useItem, useSave } from '@/hooks/useCrud';
import { formatDate } from '@/lib/format';
import { confirmAction } from '@/lib/confirm';
import { notify } from '@/lib/notify';

const recordGroups = [
  {
    title: 'Work',
    items: [
      {
        title: 'Assignments',
        subtitle: 'Sites, shifts and posting history',
        icon: 'business-outline',
        path: 'assignments',
        color: '#2457d6',
        tone: 'bg-brand-50',
      },
      {
        title: 'Documents',
        subtitle: 'Identity and employment files',
        icon: 'document-text-outline',
        path: 'documents',
        color: '#d97706',
        tone: 'bg-amber-50',
      },
      {
        title: 'ID Card',
        subtitle: 'Printable card with photo and details',
        icon: 'card-outline',
        path: 'employees/id-card',
        color: '#7c3aed',
        tone: 'bg-violet-50',
      },
    ],
  },
  {
    title: 'Payroll & equipment',
    items: [
      {
        title: 'Payments',
        subtitle: 'Salary records and payment proofs',
        icon: 'wallet-outline',
        path: 'payments',
        color: '#059669',
        tone: 'bg-emerald-50',
      },
      {
        title: 'Uniforms',
        subtitle: 'Items issued and return status',
        icon: 'shirt-outline',
        path: 'uniforms',
        color: '#e11d48',
        tone: 'bg-rose-50',
      },
    ],
  },
] as const;

const initials = (employee: Employee) =>
  [employee.first_name, employee.last_name]
    .filter(Boolean)
    .map((name) => name?.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

export default function EmployeeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: employee, error, isError, isLoading, refetch } = useItem<Employee>('employees', id);
  const save = useSave('employees');

  if (isError) {
    return <Screen error={errorMessage(error)} onRetry={() => void refetch()} />;
  }

  if (isLoading || !employee) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color="#2457d6" />
      </Screen>
    );
  }

  const toggleStatus = () => {
    const next = employee.status === 'Active' ? 'Inactive' : 'Active';
    confirmAction({
      title: `Mark ${next.toLowerCase()}?`,
      message: `${employeeName(employee)} will become ${next}.`,
      confirmText: 'Confirm',
      destructive: next === 'Inactive',
      onConfirm: () => save.mutate({ id, status: next }),
    });
  };

  const callEmployee = async () => {
    if (!employee.phone) return;

    const phoneUrl = `tel:${employee.phone.replace(/[^+\d]/g, '')}`;
    try {
      if (await Linking.canOpenURL(phoneUrl)) {
        await Linking.openURL(phoneUrl);
      } else {
        notify('Calling unavailable', 'This device cannot place phone calls.');
      }
    } catch {
      notify('Calling unavailable', 'This device cannot place phone calls.');
    }
  };

  return (
    <Screen scroll className="pt-3">
      <View className="rounded-3xl border border-slate-100 bg-white px-5 pb-5 pt-6 shadow-md">
        <View className="items-center">
          {employee.photo ? (
            <Image
              source={{ uri: fileUrl(employee.photo) }}
              className="h-24 w-24 rounded-3xl border-2 border-white bg-slate-100 shadow-sm"
            />
          ) : (
            <View className="h-24 w-24 items-center justify-center rounded-3xl border-2 border-white bg-brand-50 shadow-sm">
              <Text className="text-3xl font-bold text-brand-700">{initials(employee) || '—'}</Text>
            </View>
          )}
          <Text className="mt-4 text-center text-2xl font-bold text-slate-900">{employeeName(employee)}</Text>
          <Text className="mt-1 text-center text-sm text-slate-500">
            {employee.designation_name || 'No designation'} · {employee.employee_code}
          </Text>
          <View className="mt-3">
            <Badge label={employee.status} />
          </View>
        </View>

        <View className="mt-5 flex-row gap-3">
          <Pressable
            onPress={callEmployee}
            disabled={!employee.phone}
            accessibilityRole="button"
            accessibilityLabel="Call employee"
            accessibilityState={{ disabled: !employee.phone }}
            className={`flex-1 flex-row items-center justify-center rounded-xl border px-4 py-3 ${
              employee.phone
                ? 'border-brand-100 bg-brand-50 active:opacity-70'
                : 'border-slate-100 bg-slate-50 opacity-50'
            }`}
          >
            <Ionicons name="call-outline" size={18} color={employee.phone ? '#2457d6' : '#94a3b8'} />
            <Text className={`ml-2 font-semibold ${employee.phone ? 'text-brand-700' : 'text-slate-400'}`}>Call</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/employees/form?id=${id}` as Href)}
            accessibilityRole="button"
            accessibilityLabel="Edit employee"
            className="flex-1 flex-row items-center justify-center rounded-xl bg-brand-600 px-4 py-3 active:opacity-80"
          >
            <Ionicons name="create-outline" size={18} color="white" />
            <Text className="ml-2 font-semibold text-white">Edit</Text>
          </Pressable>
        </View>
      </View>

      <Text className="mb-2 mt-6 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">Employment</Text>
      <View className="rounded-2xl border border-slate-100 bg-white px-4 py-1">
        <InfoRow label="Employee code" value={employee.employee_code} />
        <InfoRow label="Designation" value={employee.designation_name} />
        <InfoRow label="Joining date" value={formatDate(employee.joining_date)} />
        <InfoRow label="Salary" value={employee.salary && `₹${employee.salary}`} />
      </View>

      <Text className="mb-2 mt-6 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">Contact & personal</Text>
      <View className="rounded-2xl border border-slate-100 bg-white px-4 py-1">
        <InfoRow label="Phone" value={employee.phone} />
        <InfoRow label="Alternate phone" value={employee.alternate_phone} />
        <InfoRow label="Email" value={employee.email} />
        <InfoRow label="Date of birth" value={employee.date_of_birth && formatDate(employee.date_of_birth)} />
        <InfoRow label="Blood group" value={employee.blood_group} />
        <InfoRow label="Aadhaar" value={employee.aadhaar_number} />
        <InfoRow label="Address" value={employee.address} />
      </View>

      {recordGroups.map((group) => (
        <View key={group.title} className="mt-6">
          <Text className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">{group.title}</Text>
          <View className="rounded-2xl shadow-sm">
            <View className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
              {group.items.map((item, index) => (
                <Pressable
                  key={item.title}
                  onPress={() => router.push(`/${item.path}?employee_id=${id}` as Href)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}, ${item.subtitle}`}
                  className={`flex-row items-center px-3.5 py-3.5 active:bg-slate-50 ${
                    index < group.items.length - 1 ? 'border-b border-slate-100' : ''
                  }`}
                >
                  <View className={`h-10 w-10 items-center justify-center rounded-xl ${item.tone}`}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
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

      <View className="mt-7 rounded-2xl border border-slate-200 bg-white p-4">
        <Text className="font-semibold text-slate-900">Employee status</Text>
        <Text className="mb-4 mt-1 text-xs leading-5 text-slate-500">
          {employee.status === 'Active'
            ? 'Disabling this employee removes them from active workforce lists.'
            : 'Activate this employee to include them in workforce operations again.'}
        </Text>
        <Button
          title={employee.status === 'Active' ? 'Disable Employee' : 'Activate Employee'}
          variant={employee.status === 'Active' ? 'danger' : 'secondary'}
          onPress={toggleStatus}
          loading={save.isPending}
        />
      </View>
    </Screen>
  );
}
