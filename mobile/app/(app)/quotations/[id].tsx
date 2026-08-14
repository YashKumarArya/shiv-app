import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Print from 'expo-print';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import type { Quotation, QuotationCostHead } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useItem } from '@/hooks/useCrud';
import { confirmAction } from '@/lib/confirm';
import { formatDate } from '@/lib/format';
import { invalidateResourceQueries } from '@/lib/queryInvalidation';
import { notify } from '@/lib/notify';
import { formatMoneyMinor } from '@/lib/quotation';
import {
  A4_HEIGHT_POINTS,
  A4_WIDTH_POINTS,
  buildQuotationHtml,
  embedQuotationImages,
} from '@/lib/quotationPdf';

type BusyAction = 'issue' | 'duplicate' | 'delete' | 'print' | 'share';

const rateLabel = (head: QuotationCostHead) => head.kind === 'percentage'
  ? `${(head.rateBps / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}%`
  : head.kind === 'fixed' ? 'Fixed' : 'Text';

export default function QuotationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const quotationQuery = useItem<Quotation>('quotations', id);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const quotation = quotationQuery.data;

  const issue = () => confirmAction({
    title: 'Issue this quotation?',
    message: 'Issuing locks its rates and company details permanently. Duplicate it later if a revision is needed.',
    confirmText: 'Issue quotation',
    onConfirm: async () => {
      setBusy('issue');
      try {
        const { data } = await api.post<Quotation>(`/quotations/${id}/issue`);
        queryClient.setQueryData(['quotations', String(id)], data);
        await invalidateResourceQueries(queryClient, 'quotations');
        notify('Quotation issued', 'The approved snapshot is now ready to print or share.');
      } catch (error) {
        notify('Couldn’t issue quotation', errorMessage(error));
      } finally {
        setBusy(null);
      }
    },
  });

  const duplicate = async () => {
    setBusy('duplicate');
    try {
      const { data } = await api.post<Quotation>(`/quotations/${id}/duplicate`);
      await invalidateResourceQueries(queryClient, 'quotations');
      router.push(`/quotations/form?id=${data.id}` as Href);
    } catch (error) {
      notify('Couldn’t duplicate quotation', errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const remove = () => confirmAction({
    title: 'Delete this draft?',
    message: 'The draft quotation and its number will be removed. This cannot be undone.',
    confirmText: 'Delete draft',
    destructive: true,
    onConfirm: async () => {
      setBusy('delete');
      try {
        await api.delete(`/quotations/${id}`);
        await invalidateResourceQueries(queryClient, 'quotations');
        router.back();
      } catch (error) {
        notify('Couldn’t delete quotation', errorMessage(error));
      } finally {
        setBusy(null);
      }
    },
  });

  const producePdf = async (action: 'print' | 'share') => {
    if (Platform.OS === 'web') {
      notify('Not available on web', 'Open this quotation on a phone to print, save, or share its PDF.');
      return;
    }
    setBusy(action);
    try {
      // Re-read immediately before rendering so signed logo URLs have a full
      // validity window, then embed the bytes for deterministic native output.
      const { data: fresh } = await api.get<Quotation>(`/quotations/${id}`);
      if (fresh.status !== 'Issued') throw new Error('Issue the quotation before exporting it');
      const printable = await embedQuotationImages(fresh);
      const { uri } = await Print.printToFileAsync({
        width: A4_WIDTH_POINTS,
        height: A4_HEIGHT_POINTS,
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        html: buildQuotationHtml(printable),
      });
      if (action === 'print') {
        await Print.printAsync({ uri });
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${fresh.quotation_number} — ${fresh.client_name}`,
        });
      } else {
        notify('Sharing unavailable', 'This device cannot share files.');
      }
    } catch (error) {
      notify(action === 'print' ? 'Couldn’t print quotation' : 'Couldn’t export quotation', errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  if (!quotation) {
    return (
      <Screen
        loading={quotationQuery.isLoading}
        error={quotationQuery.isError ? errorMessage(quotationQuery.error) : undefined}
        onRetry={() => void quotationQuery.refetch()}
      />
    );
  }

  const rows = new Map(quotation.calculation.rows.map((row) => [row.costHeadId, row.amountsMinor]));
  const footer = quotation.status === 'Draft' ? (
    <View className="gap-2">
      <Button title="Issue quotation" icon="checkmark-circle-outline" onPress={issue} loading={busy === 'issue'} disabled={busy !== null} />
      <Button title="Edit draft" variant="secondary" icon="create-outline" onPress={() => router.push(`/quotations/form?id=${id}` as Href)} disabled={busy !== null} />
      <Button title="Delete draft" variant="danger" icon="trash-outline" onPress={remove} loading={busy === 'delete'} disabled={busy !== null} />
    </View>
  ) : (
    <View className="gap-2">
      <Button title="Print quotation" icon="print-outline" onPress={() => void producePdf('print')} loading={busy === 'print'} disabled={busy !== null} />
      <Button title="Save / share PDF" variant="secondary" icon="share-outline" onPress={() => void producePdf('share')} loading={busy === 'share'} disabled={busy !== null} />
      <Button title="Create revision" variant="secondary" icon="copy-outline" onPress={() => void duplicate()} loading={busy === 'duplicate'} disabled={busy !== null} />
    </View>
  );

  return (
    <Screen scroll footer={footer}>
      <View className="rounded-3xl border border-slate-200 bg-white p-5">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-xs font-bold uppercase tracking-wider text-brand-600">{quotation.quotation_number}</Text>
            <Text className="mt-1 text-xl font-extrabold text-slate-900">{quotation.client_name}</Text>
            <Text className="mt-1 text-sm text-slate-500">{quotation.title}</Text>
          </View>
          <Badge label={quotation.status} />
        </View>
        <View className="mt-4 border-t border-slate-100 pt-3">
          <View className="flex-row justify-between py-1.5"><Text className="text-slate-500">Quotation date</Text><Text className="font-semibold text-slate-800">{formatDate(quotation.quotation_date)}</Text></View>
          {quotation.valid_until ? <View className="flex-row justify-between py-1.5"><Text className="text-slate-500">Valid until</Text><Text className="font-semibold text-slate-800">{formatDate(quotation.valid_until)}</Text></View> : null}
          {quotation.client_gst_number ? <View className="flex-row justify-between py-1.5"><Text className="text-slate-500">Client GSTIN</Text><Text className="font-semibold text-slate-800">{quotation.client_gst_number}</Text></View> : null}
        </View>
      </View>

      {quotation.status === 'Draft' ? (
        <View className="mt-4 flex-row items-start rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <Ionicons name="information-circle-outline" size={19} color="#d97706" />
          <Text className="ml-2 flex-1 text-sm leading-5 text-amber-900">Review the values below. Issuing the quotation locks this exact snapshot before PDF export.</Text>
        </View>
      ) : null}

      <Text className="mb-2 mt-6 px-1 text-xs font-extrabold uppercase tracking-wider text-brand-600">Rate summary</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View className="min-w-full rounded-2xl border border-slate-200 bg-white p-3">
          <View className="flex-row border-b border-slate-200 pb-2">
            <Text className="w-36 font-bold text-slate-700">Cost head</Text>
            {quotation.services.map((service) => <Text key={service.id} className="w-32 px-1 text-right text-xs font-bold text-slate-700">{service.label}</Text>)}
          </View>
          <View className="flex-row border-b border-slate-100 py-2.5">
            <Text className="w-36 text-sm font-semibold text-slate-700">Base rate</Text>
            {quotation.services.map((service) => <Text key={service.id} className="w-32 px-1 text-right text-sm text-slate-700">{formatMoneyMinor(service.baseAmountMinor)}</Text>)}
          </View>
          {quotation.cost_heads.map((head) => (
            <View key={head.id} className="flex-row border-b border-slate-100 py-2.5">
              <View className="w-36 pr-2"><Text className="text-sm font-semibold text-slate-700">{head.label}</Text><Text className="text-xs text-slate-400">{rateLabel(head)}</Text></View>
              {quotation.services.map((service) => (
                <Text key={service.id} className="w-32 px-1 text-right text-sm text-slate-700">
                  {head.kind === 'text' ? head.values[service.id] ?? '—' : formatMoneyMinor(rows.get(head.id)?.[service.id] ?? 0)}
                </Text>
              ))}
            </View>
          ))}
          <View className="flex-row pt-3">
            <Text className="w-36 text-base font-extrabold text-slate-900">Total</Text>
            {quotation.services.map((service) => <Text key={service.id} className="w-32 px-1 text-right text-base font-extrabold text-brand-700">{formatMoneyMinor(quotation.calculation.totalsMinor[service.id] ?? 0)}</Text>)}
          </View>
        </View>
      </ScrollView>

      {quotation.terms ? (
        <View className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">Terms & notes</Text>
          <Text className="mt-2 text-sm leading-6 text-slate-700">{quotation.terms}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

