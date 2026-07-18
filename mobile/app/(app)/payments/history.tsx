import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import {
  employeeName,
  type Payment,
  type SalaryTrackingEmployee,
  type SalaryTrackingResponse,
} from '@/api/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { FAB } from '@/components/ui/FAB';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';
import { formatCurrency, formatDate, monthName } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';

interface PaymentHistoryData {
  payments: Payment[];
  employee?: SalaryTrackingEmployee;
  periodState: 'past' | 'current';
}

export default function PaymentHistory() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    employee_id?: string;
    payment_month?: string;
    payment_year?: string;
  }>();
  const employeeId = Number(params.employee_id);
  const month = Number(params.payment_month);
  const year = Number(params.payment_year);
  const valid = employeeId > 0 && month >= 1 && month <= 12 && year >= 2000;

  const { data, error, isError, isLoading, isRefetching, refetch } = useQuery<PaymentHistoryData>({
    queryKey: ['payments', 'history', employeeId, year, month],
    queryFn: async () => {
      const [paymentsResponse, trackingResponse] = await Promise.all([
        api.get<Payment[]>('/payments', {
          params: { employee_id: employeeId, payment_month: month, payment_year: year, limit: 200 },
        }),
        api.get<SalaryTrackingResponse>('/payments/tracking', {
          params: { employee_id: employeeId, month, year },
        }),
      ]);

      return {
        payments: paymentsResponse.data,
        employee: trackingResponse.data.employees.find((row) => row.employee_id === employeeId),
        periodState: trackingResponse.data.period_state,
      };
    },
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

  if (!data?.employee) {
    return <Screen error="This employee is not available for the selected salary period." onRetry={() => void refetch()} />;
  }

  const payments = data.payments;
  const displayName = employeeName(data.employee) || 'Employee';
  const payroll = data.employee.due_amount;
  const paid = data.employee.paid_amount;
  const remaining = data.employee.remaining_amount;
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
              <Text className="text-lg font-extrabold text-slate-900" numberOfLines={1}>{displayName}</Text>
              <Text className="mt-0.5 text-xs font-semibold text-slate-500">{monthName(month)} {year}</Text>
            </View>
            <View className={`rounded-full px-2.5 py-1.5 ${data.employee.payroll_approved ? 'bg-emerald-50' : 'bg-amber-50'}`}>
              <Text className={`text-[10px] font-extrabold uppercase ${data.employee.payroll_approved ? 'text-emerald-700' : 'text-amber-700'}`}>
                {data.employee.payroll_snapshot_estimated
                  ? 'Legacy estimate'
                  : data.employee.payroll_approved
                    ? 'Approved'
                    : data.employee.payroll_finalized
                      ? 'Awaiting approval'
                      : 'Open'}
              </Text>
            </View>
          </View>

          {data.employee.payroll_snapshot_estimated ? (
            <View className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <Text className="text-xs font-semibold leading-4 text-amber-800">
                Frozen legacy estimate: salary and payroll-setting history from before the migration was unavailable. This preserves the values visible when the migration ran, not independently verified historical terms.
              </Text>
            </View>
          ) : null}

          {data.periodState === 'past' && !data.employee.payroll_approved ? (
            <View className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5">
              <Text className="text-xs font-semibold leading-4 text-rose-800">
                Historical payments are blocked until an administrator finalizes and approves this payroll period.
              </Text>
            </View>
          ) : null}

          <View className="mt-5 flex-row gap-2">
            <Summary label="Payroll" value={formatCurrency(payroll)} tone="text-slate-800" />
            <Summary label="Paid" value={formatCurrency(paid)} tone="text-emerald-700" />
            <Summary label="Remaining" value={formatCurrency(remaining)} tone="text-amber-700" />
          </View>
        </View>

        <View className="mb-3 mt-6 flex-row items-center justify-between px-1">
          <Text className="text-lg font-extrabold text-brand-900">Payment ledger</Text>
          <Text className="text-xs font-semibold text-slate-500">{payments.length} transactions</Text>
        </View>

        {!payments.length ? (
          <EmptyState
            title="No payments recorded"
            message="Use Add payment to record the first installment for this salary period."
            icon="receipt-outline"
          />
        ) : (
          <View style={depth.raised} className="rounded-3xl">
            <View className="overflow-hidden rounded-3xl border border-white/80 bg-white">
              {payments.map((payment, index) => {
                const isReversal = payment.entry_type === 'reversal';
                const canReverse = user?.role === 'admin' && !isReversal && !payment.is_reversed;
                return (
                  <Pressable
                    key={payment.id}
                    onPress={() => canReverse && router.push(`/payments/reverse?id=${payment.id}` as Href)}
                    disabled={!canReverse}
                    accessibilityRole={canReverse ? 'button' : undefined}
                    accessibilityLabel={`${isReversal ? 'Reversal' : 'Payment'} ${formatCurrency(payment.amount)} on ${formatDate(payment.payment_date)}`}
                    accessibilityHint={canReverse ? 'Opens the reversal form' : undefined}
                    className={`flex-row items-center p-4 ${canReverse ? 'active:bg-slate-50' : ''} ${
                      index < payments.length - 1 ? 'border-b border-slate-100' : ''
                    }`}
                  >
                    <View className={`h-11 w-11 items-center justify-center rounded-xl ${isReversal ? 'bg-rose-50' : 'bg-emerald-50'}`}>
                      <Ionicons name={isReversal ? 'arrow-undo-outline' : 'receipt-outline'} size={20} color={isReversal ? '#e11d48' : '#059669'} />
                    </View>
                    <View className="ml-3 flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className={`text-base font-extrabold ${isReversal ? 'text-rose-700' : 'text-slate-900'}`}>
                          {formatCurrency(payment.amount)}
                        </Text>
                        {payment.is_reversed ? (
                          <Text className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-extrabold uppercase text-slate-500">Reversed</Text>
                        ) : null}
                      </View>
                      <Text className="mt-0.5 text-xs font-medium text-slate-500">
                        {[isReversal ? 'Reversal' : 'Payment', formatDate(payment.payment_date), payment.payment_mode].filter(Boolean).join(' · ')}
                      </Text>
                      {isReversal && payment.reversal_reason ? (
                        <Text className="mt-1 text-xs text-rose-600" numberOfLines={2}>{payment.reversal_reason}</Text>
                      ) : payment.transaction_reference ? (
                        <Text className="mt-1 text-xs text-slate-400" numberOfLines={1}>Ref: {payment.transaction_reference}</Text>
                      ) : null}
                    </View>
                    {canReverse ? <Ionicons name="arrow-undo" size={17} color="#e11d48" /> : <Ionicons name="lock-closed-outline" size={15} color="#cbd5e1" />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {remaining > 0 && (data.periodState === 'current' || data.employee.payroll_approved)
        ? <FAB href={`/payments/form?${addParams.toString()}`} label="Add payment" />
        : null}
    </Screen>
  );
}

const Summary = ({ label, value, tone }: { label: string; value: string; tone: string }) => (
  <View className="flex-1 rounded-2xl bg-slate-50 px-3 py-3">
    <Text className="text-[10px] font-bold uppercase tracking-[0.6px] text-slate-500">{label}</Text>
    <Text className={`mt-1 text-sm font-extrabold ${tone}`} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
  </View>
);
