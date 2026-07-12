import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from 'react-native';
import { fileUrl } from '@/api/client';
import { employeeName, type Employee } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { InfoRow } from '@/components/ui/InfoRow';
import { Screen } from '@/components/ui/Screen';
import { useItem, useSave } from '@/hooks/useCrud';
import { formatDate } from '@/lib/format';

export default function EmployeeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: employee } = useItem<Employee>('employees', id);
  const save = useSave('employees');

  if (!employee) return <ActivityIndicator className="mt-12" />;

  const links = ['Assignments', 'Documents', 'Payments', 'Uniforms'] as const;

  const toggleStatus = () => {
    const next = employee.status === 'Active' ? 'Inactive' : 'Active';
    Alert.alert(`Mark ${next.toLowerCase()}?`, `${employeeName(employee)} will become ${next}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => save.mutate({ id, status: next }) },
    ]);
  };

  return (
    <Screen scroll>
      <View className="items-center">
        {employee.photo ? (
          <Image source={{ uri: fileUrl(employee.photo) }} className="h-24 w-24 rounded-full" />
        ) : (
          <View className="h-24 w-24 items-center justify-center rounded-full bg-slate-200">
            <Ionicons name="person" size={40} color="#94a3b8" />
          </View>
        )}
        <Text className="mt-3 text-xl font-bold text-slate-800">{employeeName(employee)}</Text>
        <Text className="mb-2 text-slate-500">
          {employee.designation_name} · {employee.employee_code}
        </Text>
        <Badge label={employee.status} />
      </View>

      <View className="mt-6 rounded-2xl bg-white px-4 py-1 shadow-sm">
        <InfoRow label="Phone" value={employee.phone} />
        <InfoRow label="Alternate Phone" value={employee.alternate_phone} />
        <InfoRow label="Email" value={employee.email} />
        <InfoRow label="Aadhaar" value={employee.aadhaar_number} />
        <InfoRow label="Date of Birth" value={employee.date_of_birth && formatDate(employee.date_of_birth)} />
        <InfoRow label="Joining Date" value={formatDate(employee.joining_date)} />
        <InfoRow label="Salary" value={employee.salary && `₹${employee.salary}`} />
        <InfoRow label="Address" value={employee.address} />
      </View>

      <View className="mt-4 flex-row flex-wrap justify-between gap-y-2">
        {links.map((title) => (
          <Pressable
            key={title}
            onPress={() => router.push(`/${title.toLowerCase()}?employee_id=${id}` as Href)}
            className="w-[48.5%] flex-row items-center justify-between rounded-2xl bg-white p-4 shadow-sm active:opacity-80"
          >
            <Text className="font-medium text-slate-700">{title}</Text>
            <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
          </Pressable>
        ))}
      </View>

      <View className="mt-6 gap-3">
        <Button title="Edit Details" onPress={() => router.push(`/employees/form?id=${id}` as Href)} />
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
