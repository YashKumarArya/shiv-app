import { useLocalSearchParams } from 'expo-router';
import { Image } from 'react-native';
import { fileUrl } from '@/api/client';
import { employeeName, type EmployeeDocument } from '@/api/types';
import { ResourceList } from '@/components/ResourceList';
import { ListCard } from '@/components/ui/ListCard';
import { Screen } from '@/components/ui/Screen';

export default function Documents() {
  const { employee_id } = useLocalSearchParams<{ employee_id?: string }>();
  return (
    <Screen>
      <ResourceList<EmployeeDocument>
        resource="documents"
        params={{ employee_id }}
        addHref="/documents/form"
        renderItem={(d) => (
          <ListCard
            title={d.document_type}
            subtitle={[employeeName(d), d.document_number].filter(Boolean).join(' · ')}
            right={<Image source={{ uri: fileUrl(d.document_file) }} className="h-12 w-12 rounded-lg bg-slate-100" />}
            href={`/documents/form?id=${d.id}`}
          />
        )}
      />
    </Screen>
  );
}
