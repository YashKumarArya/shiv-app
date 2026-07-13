import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import type { Payment } from '@/api/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { FAB } from '@/components/ui/FAB';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';
import { formatDate, monthName } from '@/lib/format';

const money = (value?: string | number | null) =>
  `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(value ?? 0))}`;

export default function PaymentHistory() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    employee_id?: string;
    employee_name?: string;
    payment_month?: string;
    payment_year?: string;
    payroll?: string;
    paid?: string;
    remaining?: string;
  }>();
  const employeeId = Number(params.employee_id);
  const month = Number(params.payment_month);
  const year = Number(params.payment_year);
  const valid = employeeId > 0 && month >= 1 && month <= 12 && year >= 2000;

  const { data, error, isError, isLoading, isRefetching, refetch } = useQuery<Payment[]>({
    queryKey: ['payments', 'history', employeeId, year, month],
    queryFn: async () => (
      await api.get('/payments', {
        params: { employee_id: employeeId, payment_month: month, payment_year: year, limit: 200 },
      })
    ).data,
    enabled: valid,
  });

  if (!valid) {
    return <Screen error="This payment-history link is invalid." />;
  }

  if (isLoading) {
    return <Screen loading />;
  }

  if (isError) {
    return <Screen error={errorMessage(error)} onRetry={() => void refetch()} />;
  }

  const employeeName = params.employee_name || [data?.[0]?.first_name, data?.[0]?.last_name].filter(Boolean).join(' ') || 'Employee';
  const payroll = Number(params.payroll ?? (Number(params.paid ?? 0) + Number(params.remaining ?? 0)));
  const paid = (data ?? []).reduce((total, payment) => total + Number(payment.amount ?? 0), 0);
  const remaining = Math.max(0, payroll - paid);
  const addParams = new URLSearchParams({
    employee_id: String(employeeId),
    payment_month: String(month),
    payment_year: String(year),
    ...(remaining > 0 ? { amount: String(remaining) } : {}),
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Payment History' }} />
      <ScrollView
        className="flex-1 bg-transparent"
        contentContainerClassName="px-4 pb-32 pt-4"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2457d6" />}
      >
        <View style={depth.raised} className="rounded-3xl border border-white/80 bg-white p-5">
          <View className="flex-row items-center">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-violet-50">
              <Ionicons name="wallet-outline" size={22} color="#7c3aed" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-lg font-extrabold text-slate-900" numberOfLines={1}>{employeeName}</Text>
              <Text className="mt-0.5 text-xs font-semibold text-slate-500">{monthName(month)} {year}</Text>
            </View>
          </View>

          <View className="mt-5 flex-row gap-2">
            <Summary label="Payroll" value={money(payroll)} tone="text-slate-800" />
            <Summary label="Paid" value={money(paid)} tone="text-emerald-700" />
            <Summary label="Remaining" value={money(remaining)} tone="text-amber-700" />
          </View>
        </View>

        <View className="mb-3 mt-6 flex-row items-center justify-between px-1">
          <Text className="text-lg font-extrabold text-brand-900">Payment ledger</Text>
          <Text className="text-xs font-semibold text-slate-500">{data?.length ?? 0} transactions</Text>
        </View>

        {!data?.length ? (
          <EmptyState
            title="No payments recorded"
            message="Use Add payment to record the first installment for this salary period."
            icon="receipt-outline"
          />
        ) : (
          <View style={depth.raised} className="rounded-3xl">
            <View className="overflow-hidden rounded-3xl border border-white/80 bg-white">
              {data.map((payment, index) => (
                <Pressable
                  key={payment.id}
                  onPress={() => router.push(`/payments/form?id=${payment.id}` as Href)}
                  accessibilityRole="button"
                  accessibilityLabel={`${money(payment.amount)} paid on ${formatDate(payment.payment_date)}`}
                  className={`flex-row items-center p-4 active:bg-slate-50 ${
                    index < data.length - 1 ? 'border-b border-slate-100' : ''
                  }`}
                >
                  <View className="h-11 w-11 items-center justify-center rounded-xl bg-emerald-50">
                    <Ionicons name="receipt-outline" size={20} color="#059669" />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-base font-extrabold text-slate-900">{money(payment.amount)}</Text>
                    <Text className="mt-0.5 text-xs font-medium text-slate-500">
                      {[formatDate(payment.payment_date), payment.payment_mode].filter(Boolean).join(' · ')}
                    </Text>
                    {payment.transaction_reference ? (
                      <Text className="mt-1 text-xs text-slate-400" numberOfLines={1}>Ref: {payment.transaction_reference}</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={17} color="#94a3b8" />
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {remaining > 0 ? <FAB href={`/payments/form?${addParams.toString()}`} label="Add payment" /> : null}
    </Screen>
  );
}

const Summary = ({ label, value, tone }: { label: string; value: string; tone: string }) => (
  <View className="flex-1 rounded-2xl bg-slate-50 px-3 py-3">
    <Text className="text-[10px] font-bold uppercase tracking-[0.6px] text-slate-500">{label}</Text>
    <Text className={`mt-1 text-sm font-extrabold ${tone}`} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
  </View>
);
