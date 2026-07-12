import type { Control, FieldValues, Path } from 'react-hook-form';
import { employeeName, type Employee } from '@/api/types';
import { useList, type ListParams } from '@/hooks/useCrud';
import { FormSelect, type Option } from './FormSelect';

interface Props<TRow, TForm extends FieldValues> {
  control: Control<TForm>;
  name: Path<TForm>;
  label: string;
  resource: string;
  params?: ListParams;
  getOption: (row: TRow) => Option;
}

/** A FormSelect whose options come from an API resource. */
export function ResourceSelect<TRow, TForm extends FieldValues = FieldValues>({
  resource, params, getOption, ...selectProps
}: Props<TRow, TForm>) {
  const { data } = useList<TRow>(resource, { limit: 200, ...params });
  return <FormSelect<TForm> {...selectProps} options={(data ?? []).map(getOption)} />;
}

export const EmployeeSelect = (
  props: Omit<Props<Employee, FieldValues>, 'resource' | 'getOption' | 'label'> & { label?: string },
) => (
  <ResourceSelect<Employee>
    label="Employee"
    resource="employees"
    params={{ status: 'Active' }}
    getOption={(e) => ({ label: `${employeeName(e)} (${e.employee_code})`, value: e.id })}
    {...props}
  />
);
