import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Platform, Text, TextInput, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import type { Payment } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';
import { formatCurrency, formatDate, monthName, today } from '@/lib/format';
import { notify } from '@/lib/notify';
import { invalidateQueryRoots } from '@/lib/queryInvalidation';
import { useAuth } from '@/providers/AuthProvider';
import { useState } from 'react';

export default function ReversePayment() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const paymentId = Number(id);
  const valid = Number.isInteger(paymentId) && paymentId > 0;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [reason, setReason] = useState('');

  const payment = useQuery<Payment>({
    queryKey: ['payments', String(paymentId)],
    queryFn: async () => (await api.get(`/payments/${paymentId}`)).data,
    enabled: valid && user?.role === 'admin',
  });
  const reverse = useMutation({
    mutationFn: () => api.post(`/payments/${paymentId}/reverse`, {
      reason: reason.trim(),
      reversal_date: today(),
    }),
    onSuccess: async () => {
      await invalidateQueryRoots(queryClient, ['payments', 'dashboard']);
      router.back();
    },
    onError: (error) => notify('Reversal failed', errorMessage(error)),
  });

  if (user?.role !== 'admin') return <Screen error="Only an administrator can reverse a payment." />;
  if (!valid) return <Screen error="This payment link is invalid." />;
  if (payment.isLoading) return <Screen loading />;
  if (payment.isError) return <Screen error={errorMessage(payment.error)} onRetry={() => void payment.refetch()} />;
  if (!payment.data) return <Screen error="Payment not found." />;
  if (payment.data.entry_type === 'reversal') return <Screen error="A reversal entry cannot be reversed." />;
  if (payment.data.is_reversed) return <Screen error="This payment has already been reversed." />;

  const confirmReversal = () => {
    if (reason.trim().length < 3) {
      notify('Reason required', 'Enter a clear reason for the permanent audit history.');
      return;
    }
    const proceed = () => reverse.mutate();
    if (Platform.OS === 'web') {
      if (globalThis.confirm('Create an immutable reversal entry for this payment?')) proceed();
      return;
    }
    Alert.alert(
      'Reverse this payment?',
      'The original record will remain in the ledger and an equal opposite entry will be added. This action cannot be edited or deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create reversal', style: 'destructive', onPress: proceed },
      ],
    );
  };

  return (
    <Screen
      scroll
      footer={(
        <Button
          title="Create reversal"
          icon="arrow-undo"
          variant="danger"
          onPress={confirmReversal}
          loading={reverse.isPending}
          disabled={reason.trim().length < 3}
        />
      )}
    >
      <Stack.Screen options={{ title: 'Reverse Payment' }} />
      <View style={depth.raised} className="rounded-3xl border border-rose-100 bg-white p-5">
        <View className="flex-row items-center">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-rose-50">
            <Ionicons name="lock-closed-outline" size={22} color="#e11d48" />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-lg font-extrabold text-slate-900">{formatCurrency(payment.data.original_amount ?? payment.data.amount)}</Text>
            <Text className="mt-0.5 text-xs font-semibold text-slate-500">
              {monthName(payment.data.payment_month)} {payment.data.payment_year} · {formatDate(payment.data.payment_date)}
            </Text>
          </View>
        </View>
        <Text className="mt-4 text-sm leading-5 text-slate-600">
          Payments are never overwritten or deleted. Reversing adds an equal negative ledger entry and preserves both records for audit.
        </Text>
      </View>

      <View className="mt-5">
        <Text className="mb-2 text-sm font-bold text-slate-700">Reason for reversal</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="For example: duplicate entry or incorrect amount"
          placeholderTextColor="#94a3b8"
          multiline
          maxLength={500}
          textAlignVertical="top"
          className="min-h-32 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] leading-5 text-slate-900"
          accessibilityLabel="Reason for reversal"
        />
        <Text className="mt-2 text-xs leading-4 text-slate-500">This reason becomes part of the permanent audit record.</Text>
      </View>
    </Screen>
  );
}
