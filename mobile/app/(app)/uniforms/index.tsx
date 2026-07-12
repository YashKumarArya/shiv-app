import { useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';
import { employeeName, type UniformIssue } from '@/api/types';
import { ResourceList } from '@/components/ResourceList';
import { ListCard } from '@/components/ui/ListCard';
import { Screen } from '@/components/ui/Screen';
import { useSave } from '@/hooks/useCrud';
import { formatDate, today } from '@/lib/format';

export default function Uniforms() {
  const { employee_id } = useLocalSearchParams<{ employee_id?: string }>();
  const save = useSave('uniforms');

  const markReturned = (u: UniformIssue) =>
    Alert.alert('Mark returned?', `Uniform issued to ${employeeName(u)} on ${formatDate(u.issued_date)}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark Returned', onPress: () => save.mutate({ id: u.id, returned: true, returned_date: today() }) },
    ]);

  return (
    <Screen>
      <ResourceList<UniformIssue>
        resource="uniforms"
        params={{ employee_id }}
        addHref="/uniforms/form"
        renderItem={(u) => (
          <ListCard
            title={employeeName(u)}
            subtitle={`Issued ${formatDate(u.issued_date)} · Size ${u.uniform_size ?? '—'}`}
            badge={u.returned ? 'Returned' : 'Issued'}
            onPress={u.returned ? undefined : () => markReturned(u)}
          />
        )}
      />
    </Screen>
  );
}
