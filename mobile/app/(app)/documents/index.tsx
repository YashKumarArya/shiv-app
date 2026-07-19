import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Image, Text, View } from 'react-native';
import { fileUrl } from '@/api/client';
import { employeeInitials, employeeName, type Employee, type EmployeeDocument } from '@/api/types';
import { ResourceList } from '@/components/ResourceList';
import { ListCard } from '@/components/ui/ListCard';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';
import { useItem, useList } from '@/hooks/useCrud';

function EmployeePicker() {
  const { data: documents } = useList<EmployeeDocument>('documents', { limit: 200 });
  const documentCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const doc of documents ?? []) {
      counts.set(doc.employee_id, (counts.get(doc.employee_id) ?? 0) + 1);
    }
    return counts;
  }, [documents]);

  return (
    <ResourceList<Employee>
      resource="employees"
      searchable
      emptyTitle="No employees yet"
      emptyMessage="Add an employee before uploading documents."
      renderItem={(item) => {
        const count = documentCounts.get(item.id) ?? 0;
        return (
          <ListCard
            title={employeeName(item)}
            subtitle={`${item.designation_name || 'No designation'} · ${item.employee_code} · ${count} document${count === 1 ? '' : 's'}`}
            badge={item.status}
            href={`/documents?employee_id=${item.id}`}
            leading={
              item.photo ? (
                <Image
                  source={{ uri: fileUrl(item.photo) }}
                  style={depth.subtle}
                  className="h-12 w-12 rounded-2xl border border-white bg-slate-100"
                />
              ) : (
                <View
                  style={depth.subtle}
                  className="h-12 w-12 items-center justify-center rounded-2xl border border-white bg-brand-50"
                >
                  <Text className="text-base font-bold text-brand-700">{employeeInitials(item) || '—'}</Text>
                </View>
              )
            }
          />
        );
      }}
    />
  );
}

export default function Documents() {
  const { employee_id } = useLocalSearchParams<{ employee_id?: string }>();
  const { data: employee } = useItem<Employee>('employees', employee_id);

  if (!employee_id) {
    return (
      <Screen>
        <EmployeePicker />
      </Screen>
    );
  }

  return (
    <Screen>
      {employee ? (
        <Text className="px-5 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-slate-400">
          {employeeName(employee)}’s documents
        </Text>
      ) : null}
      <ResourceList<EmployeeDocument>
        resource="documents"
        params={{ employee_id }}
        addHref={`/documents/form?employee_id=${employee_id}`}
        addLabel="Add document"
        emptyTitle="No documents yet"
        emptyMessage="Upload an employee identity or employment document."
        renderItem={(d) => (
          <ListCard
            title={d.document_type}
            subtitle={d.document_number}
            right={<Image source={{ uri: fileUrl(d.document_file) }} className="h-12 w-12 rounded-lg bg-slate-100" />}
            href={`/documents/form?id=${d.id}`}
          />
        )}
      />
    </Screen>
  );
}
