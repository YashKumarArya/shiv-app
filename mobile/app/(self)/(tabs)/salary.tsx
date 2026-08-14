import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import type { MySalary } from '@/api/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';
import { formatCurrency, formatDate, monthName } from '@/lib/format';

export default function MySalaryScreen() {
  const now = new Date();
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const isCurrentPeriod =
    period.year === now.getFullYear() && period.month === now.getMonth() + 1;

  const salary = useQuery<MySalary>({
    queryKey: ['me/salary', period.year, period.month],
    queryFn: async () => (await api.get('/me/salary', { params: period })).data,
  });

  const shift = (delta: number) => {
    const date = new Date(period.year, period.month - 1 + delta, 1);
    setPeriod({ month: date.getMonth() + 1, year: date.getFullYear() });
  };

  const data = salary.data;

  return (
    <Screen>
      <View className="mx-4 mt-4 flex-row items-center rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <Pressable
          onPress={() => shift(-1)}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          className="h-12 w-12 items-center justify-center rounded-xl bg-slate-50 active:bg-slate-100"
        >
          <Ionicons name="chevron-back" size={21} color="#334155" />
        </Pressable>
        <View className="flex-1 items-center">
          <Text className="text-base font-bold text-slate-900">
            {monthName(period.month)} {period.year}
          </Text>
        </View>
        <Pressable
          onPress={() => shift(1)}
          disabled={isCurrentPeriod}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: isCurrentPeriod }}
          className={`h-12 w-12 items-center justify-center rounded-xl bg-slate-50 ${
            isCurrentPeriod ? 'opacity-40' : 'active:bg-slate-100'
          }`}
        >
          <Ionicons name="chevron-forward" size={21} color={isCurrentPeriod ? '#94a3b8' : '#334155'} />
        </Pressable>
      </View>

      {salary.isLoading ? (
        <ActivityIndicator className="mt-12" color="#2457d6" />
      ) : salary.isError ? (
        <View className="p-4">
          <EmptyState
            title="Couldn’t load your salary"
            message={errorMessage(salary.error)}
            icon="cloud-offline-outline"
          />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="p-4 pb-10"
          refreshControl={
            <RefreshControl refreshing={salary.isRefetching} onRefresh={() => void salary.refetch()} />
          }
        >
          {!data?.salary_set ? (
            <EmptyState
              title="Salary not set"
              message="Your monthly salary has not been recorded yet. Contact your supervisor."
              icon="wallet-outline"
            />
          ) : (
            <>
              <View style={depth.subtle} className="mb-4 rounded-2xl border border-slate-200 bg-white p-5">
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Earned this month
                </Text>
                <Text className="mt-1 text-3xl font-extrabold text-slate-900">
                  {formatCurrency(data.due_amount)}
                </Text>
                <Text className="mt-1 text-sm text-slate-500">
                  {data.worked_days} of {data.payable_days} days worked
                </Text>

                <View className="mt-4 flex-row">
                  <View className="flex-1">
                    <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Paid</Text>
                    <Text className="mt-0.5 text-lg font-extrabold text-emerald-700">
                      {formatCurrency(data.paid_amount)}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Remaining
                    </Text>
                    <Text className="mt-0.5 text-lg font-extrabold text-amber-700">
                      {formatCurrency(data.remaining_amount)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={depth.subtle} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
                <Text className="mb-2 text-sm font-bold text-slate-800">How this is worked out</Text>
                <View className="flex-row justify-between border-b border-slate-100 py-2">
                  <Text className="text-sm text-slate-500">Monthly salary</Text>
                  <Text className="text-sm font-medium text-slate-800">
                    {formatCurrency(data.monthly_salary)}
                  </Text>
                </View>
                <View className="flex-row justify-between border-b border-slate-100 py-2">
                  <Text className="text-sm text-slate-500">Per day</Text>
                  <Text className="text-sm font-medium text-slate-800">
                    {formatCurrency(data.per_day_rate)}
                  </Text>
                </View>
                <View className="flex-row justify-between py-2">
                  <Text className="text-sm text-slate-500">Days worked</Text>
                  <Text className="text-sm font-medium text-slate-800">
                    {data.worked_days} × {formatCurrency(data.per_day_rate)}
                  </Text>
                </View>
              </View>

              <Text className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                Payments received
              </Text>
              {data.payments.length === 0 ? (
                <View style={depth.subtle} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <Text className="text-sm text-slate-500">No payments recorded for this month yet.</Text>
                </View>
              ) : (
                <View style={depth.subtle} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {data.payments.map((payment, index) => {
                    const reversal = payment.entry_type === 'reversal';
                    return (
                      <View
                        key={payment.id}
                        className={`min-h-14 flex-row items-center px-3.5 py-3 ${
                          index < data.payments.length - 1 ? 'border-b border-slate-100' : ''
                        }`}
                      >
                        <View
                          className={`h-9 w-9 items-center justify-center rounded-xl ${
                            reversal ? 'bg-red-50' : 'bg-emerald-50'
                          }`}
                        >
                          <Ionicons
                            name={reversal ? 'arrow-undo' : 'cash-outline'}
                            size={17}
                            color={reversal ? '#dc2626' : '#059669'}
                          />
                        </View>
                        <View className="ml-3 flex-1">
                          <Text className="font-semibold text-slate-800">
                            {formatDate(payment.payment_date)}
                          </Text>
                          <Text className="mt-0.5 text-xs text-slate-500">
                            {reversal ? 'Reversed' : payment.payment_mode ?? 'Payment'}
                          </Text>
                        </View>
                        <Text
                          className={`text-sm font-extrabold ${reversal ? 'text-red-700' : 'text-slate-900'}`}
                        >
                          {reversal ? '−' : ''}
                          {formatCurrency(Math.abs(Number(payment.amount)))}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
