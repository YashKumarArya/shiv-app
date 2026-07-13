import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsMutating } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm, type DefaultValues, type FieldValues } from 'react-hook-form';
import type { ZodSchema } from 'zod';
import { errorMessage } from '@/api/client';
import { useItem, useSave } from './useCrud';
import { notify } from '@/lib/notify';

/** Postgres returns dates as ISO timestamps and times as HH:MM:SS — trim for form inputs. */
const normalize = (value: unknown) => {
  if (value == null) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  if (typeof value === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(value)) return value.slice(0, 5);
  return value;
};

/**
 * Drives both create and edit forms for a resource.
 * Pass ?id= in the route to load and edit an existing record.
 */
export function useResourceForm(
  resource: string,
  schema: ZodSchema,
  defaults: Record<string, unknown>,
) {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const item = useItem<Record<string, unknown>>(resource, id);
  const { data } = item;
  const save = useSave(resource);
  const form = useForm<FieldValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults as DefaultValues<FieldValues>,
  });
  const { dirtyFields } = form.formState;
  const uploading = useIsMutating({ mutationKey: ['upload'] }) > 0;

  useEffect(() => {
    if (!data) return;
    form.reset(Object.fromEntries(Object.keys(defaults).map((key) => [key, normalize(data[key])])));
  }, [data]);

  const submit = form.handleSubmit(async (values) => {
    const rawValues = form.getValues();
    const dirtyKeys = Object.keys(dirtyFields);
    const body = id
      ? Object.fromEntries(dirtyKeys.map((key) => {
          const rawValue = rawValues[key];
          return [key, rawValue === '' || rawValue == null ? null : values[key]];
        }))
      : Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '' && value != null));

    try {
      if (id && !Object.keys(body).length) {
        router.back();
        return;
      }
      await save.mutateAsync({ id, ...body });
      router.back();
    } catch (error) {
      notify('Save failed', errorMessage(error));
    }
  });

  return {
    ...form,
    submit,
    saving: save.isPending || uploading,
    isEdit: !!id,
    formLoading: !!id && item.isLoading,
    formError: id && item.isError ? errorMessage(item.error) : undefined,
    retryForm: item.refetch,
  };
}
