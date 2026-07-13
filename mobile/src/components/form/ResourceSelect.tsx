import type { FieldValues } from 'react-hook-form';
import { employeeName, type Employee } from '@/api/types';
import { useList, type ListParams } from '@/hooks/useCrud';
import { FormSelect, type FormSelectProps, type Option } from './FormSelect';

type Props<TRow, TForm extends FieldValues> = Omit<
  FormSelectProps<TForm>,
  'options' | 'loading' | 'loadError' | 'onRetry'
> & {
  resource: string;
  params?: ListParams;
  getOption: (row: TRow) => Option;
};

/** A FormSelect whose options come from an API resource. */
export function ResourceSelect<TRow, TForm extends FieldValues = FieldValues>({
  resource,
  params,
  getOption,
  ...selectProps
}: Props<TRow, TForm>) {
  const { data, isLoading, isError, refetch } = useList<TRow>(resource, { limit: 200, ...params });

  return (
    <FormSelect<TForm>
      {...selectProps}
      options={(data ?? []).map(getOption)}
      loading={isLoading}
      loadError={isError ? 'Couldn’t load options. Check your connection and try again.' : undefined}
      onRetry={() => void refetch()}
    />
  );
}

export const EmployeeSelect = (
  props: Omit<Props<Employee, FieldValues>, 'resource' | 'getOption' | 'label'> & { label?: string },
) => (
  <ResourceSelect<Employee>
    label="Employee"
    resource="employees"
    params={{ status: 'Active' }}
    getOption={(employee) => ({
      label: `${employeeName(employee)} (${employee.employee_code})`,
      value: employee.id,
    })}
    {...props}
  />
);
