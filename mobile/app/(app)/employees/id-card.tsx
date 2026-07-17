import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { api, errorMessage, fileUrl } from '@/api/client';
import { employeeName, type Assignment, type Employee } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { depth } from '@/components/ui/depth';
import { Screen } from '@/components/ui/Screen';
import { useItem, useList } from '@/hooks/useCrud';
import { formatDate } from '@/lib/format';
import { notify } from '@/lib/notify';

interface IdRowProps {
  label: string;
  value?: string | null;
  bold?: boolean;
  numberOfLines?: number;
}

const IdRow = ({ label, value, bold, numberOfLines }: IdRowProps) => {
  if (!value) return null;
  return (
    <View className="flex-row py-[1.5px]">
      <Text className="w-[78px] text-[11px] font-semibold text-slate-500">{label}</Text>
      <Text
        numberOfLines={numberOfLines}
        className={`flex-1 text-[12.5px] ${bold ? 'font-extrabold text-slate-900' : 'font-medium text-slate-800'}`}
      >
        {value}
      </Text>
    </View>
  );
};

export default function EmployeeIdCard() {
  const { employee_id: employeeId } = useLocalSearchParams<{ employee_id: string }>();
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const { data: employee, error, isError, isLoading, refetch } = useItem<Employee>('employees', employeeId);
  const { data: assignments } = useList<Assignment>('assignments', {
    employee_id: employeeId,
    status: 'Active',
    limit: 1,
  });
  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
  });

  if (isError) return <Screen error={errorMessage(error)} onRetry={() => void refetch()} />;
  if (isLoading || !employee) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color="#2457d6" />
      </Screen>
    );
  }

  const companyName = settings?.company_name || 'Company name not set';
  const companyAddress = settings?.company_address;
  const companyPhone = settings?.company_phone;
  const logo = settings?.company_logo;
  const signature = settings?.company_signature;
  const siteName = assignments?.[0]?.site_name;

  const shareCard = async () => {
    if (Platform.OS === 'web') {
      notify('Not available on web', 'Open this screen on a phone to save or share the ID card.');
      return;
    }
    setSharing(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `${employeeName(employee)} — ID Card`,
        });
      } else {
        notify('Sharing unavailable', 'This device cannot share files.');
      }
    } catch (shareError) {
      notify('Couldn’t export ID card', errorMessage(shareError));
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen scroll className="items-center pt-5">
      <View
        ref={cardRef}
        collapsable={false}
        style={[depth.raised, { aspectRatio: 1.6 }]}
        className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-4"
      >
        {logo ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }}
          >
            <Image
              source={{ uri: fileUrl(logo) }}
              resizeMode="contain"
              style={{ width: '60%', height: '70%', opacity: 0.07 }}
            />
          </View>
        ) : null}

        <View className="flex-row items-center justify-center">
          {logo ? (
            <Image source={{ uri: fileUrl(logo) }} resizeMode="contain" className="h-9 w-9 rounded-lg" />
          ) : (
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
              <Ionicons name="shield-checkmark-outline" size={18} color="#2457d6" />
            </View>
          )}
          <View className="ml-2 items-center">
            <Text numberOfLines={1} className="text-[14px] font-extrabold text-slate-900">
              {companyName}
            </Text>
            {companyAddress ? (
              <Text numberOfLines={1} className="text-[9px] text-slate-500">
                {companyAddress}
              </Text>
            ) : null}
            {companyPhone ? (
              <Text numberOfLines={1} className="text-[9px] text-slate-500">
                Ph: {companyPhone}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="mt-3 flex-row items-start">
          <View className="flex-1 pr-2" style={signature ? { paddingRight: 82 } : undefined}>
            <IdRow label="Name" value={employeeName(employee).toUpperCase()} bold />
            <IdRow label="Rank" value={employee.designation_name} />
            <IdRow label="ID" value={employee.employee_code} />
            <IdRow label="Blood Grp" value={employee.blood_group} />
            <IdRow label="D.O.B" value={employee.date_of_birth ? formatDate(employee.date_of_birth) : undefined} />
            <IdRow label="Site" value={siteName} />
            <IdRow label="Address" value={employee.address} numberOfLines={2} />
          </View>

          <View className="h-[78px] w-[64px] items-center justify-center overflow-hidden rounded-md border border-slate-300 bg-slate-50">
            {employee.photo ? (
              <Image source={{ uri: fileUrl(employee.photo) }} resizeMode="cover" className="h-full w-full" />
            ) : (
              <Ionicons name="person-outline" size={24} color="#94a3b8" />
            )}
          </View>
        </View>

        {signature ? (
          <View style={{ position: 'absolute', right: 14, bottom: 12, alignItems: 'center' }}>
            <Image source={{ uri: fileUrl(signature) }} resizeMode="contain" style={{ width: 76, height: 30 }} />
            <View style={{ width: 76, height: 1, backgroundColor: '#94a3b8' }} />
            <Text style={{ marginTop: 2, fontSize: 7.5, fontWeight: '600', color: '#64748b' }}>
              Authorized Signatory
            </Text>
          </View>
        ) : null}
      </View>

      <View className="mt-6 w-full max-w-[440px]">
        <Button title="Share / Save ID Card" icon="share-social-outline" onPress={shareCard} loading={sharing} />
      </View>

      {!logo || !settings?.company_name ? (
        <Text className="mt-3 max-w-[440px] px-2 text-center text-xs text-slate-400">
          Add your company name and logo from Settings → Company & ID card to complete this card.
        </Text>
      ) : null}
    </Screen>
  );
}
