import { usePreventRemove } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { api, errorMessage } from '@/api/client';
import type { Quotation, QuotationCostHead, QuotationInput } from '@/api/types';
import { FormSectionTitle } from '@/components/form/FormSectionTitle';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useItem } from '@/hooks/useCrud';
import { addDays, today } from '@/lib/format';
import { invalidateResourceQueries } from '@/lib/queryInvalidation';
import { notify } from '@/lib/notify';
import {
  calculateQuotation,
  formatMoneyMinor,
  moneyMinorInput,
  parseMoneyMinor,
  parsePercentageBps,
  percentageInput,
  quotationRecordToInput,
} from '@/lib/quotation';

interface ServiceDraft { id: string; label: string; baseAmount: string }
type CostHeadDraft =
  | { id: string; label: string; kind: 'percentage'; rate: string; basis: 'base' | 'running_subtotal' }
  | { id: string; label: string; kind: 'fixed'; amounts: Record<string, string> }
  | { id: string; label: string; kind: 'text'; values: Record<string, string> };

interface Fields {
  quotationDate: string;
  validUntil: string;
  title: string;
  clientName: string;
  clientAddress: string;
  clientGstNumber: string;
  clientContactName: string;
  clientPhone: string;
  clientEmail: string;
  terms: string;
}

const initialFields = (): Fields => ({
  quotationDate: today(),
  validUntil: addDays(today(), 30),
  title: 'Rates - 8 Hours Duty',
  clientName: '',
  clientAddress: '',
  clientGstNumber: '',
  clientContactName: '',
  clientPhone: '',
  clientEmail: '',
  terms: 'Rates include monthly wages and applicable statutory charges. Rates are subject to revision when government wage or tax rules change.',
});

const initialServices = (): ServiceDraft[] => [
  { id: 'security_guard', label: 'Security Guard', baseAmount: '' },
  { id: 'security_supervisor', label: 'Security Supervisor', baseAmount: '' },
  { id: 'gunman', label: 'Gunman', baseAmount: '' },
  { id: 'housekeeping', label: 'House Keeping', baseAmount: '' },
];

const initialCostHeads = (): CostHeadDraft[] => [
  { id: 'pf', label: 'PF', kind: 'percentage', rate: '13', basis: 'base' },
  { id: 'esic', label: 'ESIC', kind: 'percentage', rate: '3.25', basis: 'base' },
  { id: 'admin_charges', label: 'Admin charges', kind: 'percentage', rate: '1', basis: 'base' },
  { id: 'service_charges', label: 'Service Charges', kind: 'percentage', rate: '8', basis: 'base' },
  {
    id: 'weekly_rest', label: 'Rest', kind: 'text',
    values: Object.fromEntries(initialServices().map((service) => [service.id, '4 days'])),
  },
  { id: 'gst', label: 'GST', kind: 'percentage', rate: '18', basis: 'running_subtotal' },
];

let itemSequence = 0;
const newItemId = (prefix: string) => `${prefix}_${Date.now()}_${++itemSequence}`;
const calendarDate = /^\d{4}-\d{2}-\d{2}$/;

const Field = ({ label, multiline, ...props }: TextInputProps & { label: string }) => (
  <View className="mb-4">
    <Text className="mb-2 text-sm font-semibold text-slate-700">{label}</Text>
    <TextInput
      {...props}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      placeholderTextColor="#94a3b8"
      selectionColor="#2563eb"
      className={`min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 ${multiline ? 'min-h-28 py-3' : 'py-3'}`}
    />
  </View>
);

const draftsFromQuotation = (quotation: Quotation) => {
  const input = quotationRecordToInput(quotation);
  return {
    fields: {
      quotationDate: input.quotationDate,
      validUntil: input.validUntil ?? '',
      title: input.title,
      clientName: input.clientName,
      clientAddress: input.clientAddress ?? '',
      clientGstNumber: input.clientGstNumber ?? '',
      clientContactName: input.clientContactName ?? '',
      clientPhone: input.clientPhone ?? '',
      clientEmail: input.clientEmail ?? '',
      terms: input.terms ?? '',
    },
    services: input.services.map((service) => ({
      id: service.id, label: service.label, baseAmount: moneyMinorInput(service.baseAmountMinor),
    })),
    costHeads: input.costHeads.map((head): CostHeadDraft => {
      if (head.kind === 'percentage') {
        return { ...head, rate: percentageInput(head.rateBps) };
      }
      if (head.kind === 'fixed') {
        return {
          id: head.id, label: head.label, kind: head.kind,
          amounts: Object.fromEntries(Object.entries(head.amountsMinor).map(([key, value]) => [key, moneyMinorInput(value)])),
        };
      }
      return { id: head.id, label: head.label, kind: head.kind, values: head.values };
    }),
  };
};

const buildInput = (
  fields: Fields,
  services: ServiceDraft[],
  costHeads: CostHeadDraft[],
): { input?: QuotationInput; error?: string } => {
  if (!fields.clientName.trim()) return { error: 'Enter the client name.' };
  if (!fields.title.trim()) return { error: 'Enter a quotation title.' };
  if (!calendarDate.test(fields.quotationDate)) return { error: 'Quotation date must use YYYY-MM-DD.' };
  if (fields.validUntil && !calendarDate.test(fields.validUntil)) return { error: 'Valid-until date must use YYYY-MM-DD.' };
  if (fields.validUntil && fields.validUntil < fields.quotationDate) return { error: 'Valid-until date cannot be before the quotation date.' };
  if (fields.clientEmail && !/^\S+@\S+\.\S+$/.test(fields.clientEmail)) return { error: 'Enter a valid client email address.' };
  if (!services.length) return { error: 'Add at least one service.' };

  const parsedServices = services.map((service) => ({
    id: service.id,
    label: service.label.trim(),
    baseAmountMinor: parseMoneyMinor(service.baseAmount),
  }));
  const invalidService = parsedServices.find((service) => !service.label || service.baseAmountMinor === null);
  if (invalidService) return { error: 'Every service needs a name and a valid base amount.' };

  const parsedHeads: QuotationCostHead[] = [];
  for (const head of costHeads) {
    if (!head.label.trim()) return { error: 'Every cost head needs a name.' };
    if (head.kind === 'percentage') {
      const rateBps = parsePercentageBps(head.rate);
      if (rateBps === null) return { error: `${head.label || 'Percentage'} must be between 0.01% and 100%.` };
      parsedHeads.push({ id: head.id, label: head.label.trim(), kind: head.kind, rateBps, basis: head.basis });
    } else if (head.kind === 'fixed') {
      const amountsMinor: Record<string, number> = {};
      for (const service of services) {
        const amount = parseMoneyMinor(head.amounts[service.id] || '0');
        if (amount === null) return { error: `Enter a valid ${head.label} amount for ${service.label}.` };
        amountsMinor[service.id] = amount;
      }
      parsedHeads.push({ id: head.id, label: head.label.trim(), kind: head.kind, amountsMinor });
    } else {
      parsedHeads.push({
        id: head.id,
        label: head.label.trim(),
        kind: head.kind,
        values: Object.fromEntries(services.map((service) => [service.id, head.values[service.id] ?? ''])),
      });
    }
  }

  return {
    input: {
      ...fields,
      validUntil: fields.validUntil || null,
      clientAddress: fields.clientAddress || null,
      clientGstNumber: fields.clientGstNumber || null,
      clientContactName: fields.clientContactName || null,
      clientPhone: fields.clientPhone || null,
      clientEmail: fields.clientEmail || null,
      terms: fields.terms || null,
      services: parsedServices.map((service) => ({ ...service, baseAmountMinor: service.baseAmountMinor! })),
      costHeads: parsedHeads,
    },
  };
};

export default function QuotationForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const item = useItem<Quotation>('quotations', id);
  const [fields, setFields] = useState(initialFields);
  const [services, setServices] = useState(initialServices);
  const [costHeads, setCostHeads] = useState(initialCostHeads);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const initialized = useRef(false);
  const allowLeave = useRef(false);

  useEffect(() => {
    if (!id || !item.data || initialized.current) return;
    if (item.data.status !== 'Draft') {
      notify('Quotation is locked', 'Issued quotations cannot be edited. Duplicate it to create a revision.');
      allowLeave.current = true;
      router.replace(`/quotations/${item.data.id}` as Href);
      return;
    }
    const drafts = draftsFromQuotation(item.data);
    setFields(drafts.fields);
    setServices(drafts.services);
    setCostHeads(drafts.costHeads);
    initialized.current = true;
  }, [id, item.data]);

  usePreventRemove(dirty || saving, ({ data }) => {
    if (allowLeave.current) return navigation.dispatch(data.action);
    if (saving) return;
    const discard = () => {
      allowLeave.current = true;
      navigation.dispatch(data.action);
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm('Discard your unsaved quotation changes?')) discard();
    } else {
      Alert.alert('Discard changes?', 'This quotation has unsaved changes.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: discard },
      ]);
    }
  });

  const touch = () => setDirty(true);
  const updateField = (key: keyof Fields, value: string) => {
    touch();
    setFields((current) => ({ ...current, [key]: value }));
  };
  const updateService = (serviceId: string, values: Partial<ServiceDraft>) => {
    touch();
    setServices((current) => current.map((service) => service.id === serviceId ? { ...service, ...values } : service));
  };
  const removeService = (serviceId: string) => {
    if (services.length === 1) return notify('One service required', 'A quotation must contain at least one service.');
    touch();
    setServices((current) => current.filter((service) => service.id !== serviceId));
  };
  const addService = () => {
    if (services.length >= 8) return notify('Service limit reached', 'Use up to eight service columns per quotation.');
    const id = newItemId('service');
    touch();
    setServices((current) => [...current, { id, label: '', baseAmount: '' }]);
    setCostHeads((current) => current.map((head) => head.kind === 'fixed'
      ? { ...head, amounts: { ...head.amounts, [id]: '' } }
      : head.kind === 'text'
        ? { ...head, values: { ...head.values, [id]: '' } }
        : head));
  };
  const updateHead = (headId: string, updater: (head: CostHeadDraft) => CostHeadDraft) => {
    touch();
    setCostHeads((current) => current.map((head) => head.id === headId ? updater(head) : head));
  };
  const addHead = (kind: CostHeadDraft['kind']) => {
    if (costHeads.length >= 30) return notify('Cost-head limit reached', 'Use up to thirty cost heads per quotation.');
    const id = newItemId('head');
    const head: CostHeadDraft = kind === 'percentage'
      ? { id, label: '', kind, rate: '', basis: 'base' }
      : kind === 'fixed'
        ? { id, label: '', kind, amounts: Object.fromEntries(services.map((service) => [service.id, ''])) }
        : { id, label: '', kind, values: Object.fromEntries(services.map((service) => [service.id, ''])) };
    touch();
    setCostHeads((current) => [...current, head]);
  };

  const parsed = useMemo(() => buildInput(fields, services, costHeads), [fields, services, costHeads]);
  const preview = parsed.input
    ? calculateQuotation(parsed.input.services, parsed.input.costHeads)
    : null;

  const save = async () => {
    if (!parsed.input) return notify('Check quotation details', parsed.error ?? 'Some fields are invalid.');
    setSaving(true);
    try {
      const response = id
        ? await api.put<Quotation>(`/quotations/${id}`, parsed.input)
        : await api.post<Quotation>('/quotations', parsed.input);
      await invalidateResourceQueries(queryClient, 'quotations');
      allowLeave.current = true;
      setDirty(false);
      router.replace(`/quotations/${response.data.id}` as Href);
    } catch (error) {
      notify('Couldn’t save quotation', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      scroll
      loading={!!id && item.isLoading}
      error={id && item.isError ? errorMessage(item.error) : undefined}
      onRetry={() => void item.refetch()}
      footer={<Button title={id ? 'Update draft' : 'Save draft'} icon="save-outline" onPress={() => void save()} loading={saving} />}
    >
      <FormSectionTitle title="Client" description="The recipient details printed on the quotation." />
      <Field label="Client name *" value={fields.clientName} onChangeText={(value) => updateField('clientName', value)} />
      <Field label="Address" value={fields.clientAddress} onChangeText={(value) => updateField('clientAddress', value)} multiline />
      <Field label="GST number" value={fields.clientGstNumber} onChangeText={(value) => updateField('clientGstNumber', value)} autoCapitalize="characters" />
      <Field label="Contact person" value={fields.clientContactName} onChangeText={(value) => updateField('clientContactName', value)} />
      <Field label="Phone" value={fields.clientPhone} onChangeText={(value) => updateField('clientPhone', value)} keyboardType="phone-pad" />
      <Field label="Email" value={fields.clientEmail} onChangeText={(value) => updateField('clientEmail', value)} keyboardType="email-address" autoCapitalize="none" />

      <FormSectionTitle title="Document" />
      <Field label="Quotation title *" value={fields.title} onChangeText={(value) => updateField('title', value)} />
      <Field label="Quotation date *" value={fields.quotationDate} onChangeText={(value) => updateField('quotationDate', value)} placeholder="YYYY-MM-DD" />
      <Field label="Valid until" value={fields.validUntil} onChangeText={(value) => updateField('validUntil', value)} placeholder="YYYY-MM-DD" />

      <FormSectionTitle title="Services" description="Each service becomes a rate column on the A4 quotation." />
      {services.map((service, index) => (
        <View key={service.id} className="mb-3 rounded-2xl border border-slate-200 bg-white p-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="font-bold text-slate-800">Service {index + 1}</Text>
            <Pressable onPress={() => removeService(service.id)} accessibilityRole="button">
              <Text className="font-semibold text-red-600">Remove</Text>
            </Pressable>
          </View>
          <Field label="Service name" value={service.label} onChangeText={(label) => updateService(service.id, { label })} placeholder="e.g. Security Guard" />
          <Field label="Base monthly rate (₹)" value={service.baseAmount} onChangeText={(baseAmount) => updateService(service.id, { baseAmount })} keyboardType="decimal-pad" placeholder="0.00" />
        </View>
      ))}
      <Button title="Add service" variant="secondary" icon="add" onPress={addService} />

      <FormSectionTitle title="Cost heads" description="Percentage rows can use the base rate or the running subtotal." />
      {costHeads.map((head, index) => (
        <View key={head.id} className="mb-3 rounded-2xl border border-slate-200 bg-white p-4">
          <View className="mb-3 flex-row items-center justify-between">
            <View>
              <Text className="font-bold text-slate-800">Cost head {index + 1}</Text>
              <Text className="mt-0.5 text-xs uppercase text-slate-400">{head.kind}</Text>
            </View>
            <Pressable onPress={() => { touch(); setCostHeads((current) => current.filter((item) => item.id !== head.id)); }} accessibilityRole="button">
              <Text className="font-semibold text-red-600">Remove</Text>
            </Pressable>
          </View>
          <Field label="Name" value={head.label} onChangeText={(label) => updateHead(head.id, (current) => ({ ...current, label }))} placeholder="e.g. PF" />
          {head.kind === 'percentage' ? (
            <>
              <Field label="Percentage" value={head.rate} onChangeText={(rate) => updateHead(head.id, (current) => current.kind === 'percentage' ? { ...current, rate } : current)} keyboardType="decimal-pad" placeholder="0.00" />
              <Text className="mb-2 text-sm font-semibold text-slate-700">Calculated on</Text>
              <View className="mb-2 flex-row gap-2">
                {([['base', 'Base rate'], ['running_subtotal', 'Running subtotal']] as const).map(([basis, label]) => (
                  <Pressable
                    key={basis}
                    onPress={() => updateHead(head.id, (current) => current.kind === 'percentage' ? { ...current, basis } : current)}
                    className={`flex-1 rounded-xl border px-3 py-3 ${head.basis === basis ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white'}`}
                  >
                    <Text className={`text-center text-xs font-bold ${head.basis === basis ? 'text-brand-700' : 'text-slate-600'}`}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : services.map((service) => (
            <Field
              key={service.id}
              label={`${service.label || 'Service'} ${head.kind === 'fixed' ? 'amount (₹)' : 'text'}`}
              value={head.kind === 'fixed' ? head.amounts[service.id] ?? '' : head.values[service.id] ?? ''}
              keyboardType={head.kind === 'fixed' ? 'decimal-pad' : 'default'}
              onChangeText={(value) => updateHead(head.id, (current) => current.kind === 'fixed'
                ? { ...current, amounts: { ...current.amounts, [service.id]: value } }
                : current.kind === 'text'
                  ? { ...current, values: { ...current.values, [service.id]: value } }
                  : current)}
            />
          ))}
        </View>
      ))}
      <View className="gap-2">
        <Button title="Add percentage" variant="secondary" icon="add" onPress={() => addHead('percentage')} />
        <Button title="Add fixed amount" variant="secondary" icon="add" onPress={() => addHead('fixed')} />
        <Button title="Add text row" variant="secondary" icon="add" onPress={() => addHead('text')} />
      </View>

      <FormSectionTitle title="Live totals" />
      <View className="mb-5 rounded-2xl border border-brand-100 bg-brand-50 p-4">
        {preview ? services.map((service) => (
          <View key={service.id} className="flex-row justify-between border-b border-brand-100 py-2 last:border-b-0">
            <Text className="mr-3 flex-1 text-sm font-semibold text-slate-700">{service.label}</Text>
            <Text className="font-bold text-brand-800">{formatMoneyMinor(preview.totalsMinor[service.id])}</Text>
          </View>
        )) : <Text className="text-sm leading-5 text-slate-500">Complete the required amounts to see calculated totals.</Text>}
      </View>

      <FormSectionTitle title="Terms & notes" />
      <Field label="Printed below the rate table" value={fields.terms} onChangeText={(value) => updateField('terms', value)} multiline />
    </Screen>
  );
}
