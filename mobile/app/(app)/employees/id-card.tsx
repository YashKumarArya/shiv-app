import {
  useRef,
  useState,
} from 'react';

import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import {
  ActivityIndicator,
  Image,
  Platform,
  type StyleProp,
  Text,
  type TextStyle,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';

import {
  api,
  errorMessage,
  fileUrl,
} from '@/api/client';
import {
  type Assignment,
  type Employee,
  employeeName,
} from '@/api/types';
import { Button } from '@/components/ui/Button';
import { depth } from '@/components/ui/depth';
import { Screen } from '@/components/ui/Screen';
import {
  useItem,
  useList,
} from '@/hooks/useCrud';
import { formatDate } from '@/lib/format';
import { notify } from '@/lib/notify';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

interface IdRowProps {
  label: string;
  value?: string | null;
  bold?: boolean;
  /** The employee's name — the one field that should read as the card's headline. */
  large?: boolean;
  numberOfLines?: number;
  /** Top-align the label instead of centering it, for a row that may wrap to several lines. */
  multiline?: boolean;
  valueStyle?: StyleProp<TextStyle>;
}

const IdRow = ({ label, value, bold, large, numberOfLines, multiline, valueStyle }: IdRowProps) => {
  if (!value) return null;
  return (
    <View className={`flex-row ${multiline ? 'items-start' : 'items-center'} ${large ? 'mb-1 py-0.5' : 'py-[1.5px]'}`}>
      <Text className="w-[82px] text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</Text>
      <Text
        numberOfLines={numberOfLines}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={valueStyle}
        className={`flex-1 ${large ? 'text-[17px]' : 'text-[12.5px]'} ${bold ? 'font-extrabold text-slate-900' : 'font-medium text-slate-800'}`}
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
      {/* Fixed CR80-ish aspect ratio, like a real printable ID card. Long text
          (address, name, company details) shrinks to fit via adjustsFontSizeToFit
          rather than the card growing or content getting cut off. */}
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
              style={{ width: '60%', height: '80%', opacity: 0.07 }}
            />
          </View>
        ) : null}

        <View className="flex-row items-start justify-center">
          {logo ? (
            <Image source={{ uri: fileUrl(logo) }} resizeMode="contain" className="h-11 w-11 rounded-lg" />
          ) : (
            <View className="h-11 w-11 items-center justify-center rounded-lg bg-brand-50">
              <Ionicons name="shield-checkmark-outline" size={20} color="#2457d6" />
            </View>
          )}
          {/* mt-3 shifts just enough that the logo's center lines up with the
              company name line specifically, not the midpoint of the whole
              name+address+phone block (which sits lower since it has 3 lines). */}
          <View className="ml-2 mt-3 max-w-[70%] items-center">
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              className="text-[15px] font-extrabold text-slate-900"
            >
              {companyName}
            </Text>
            {companyAddress ? (
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} className="text-[9.5px] text-slate-500">
                {companyAddress}
              </Text>
            ) : null}
            {companyPhone ? (
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} className="text-[9.5px] text-slate-500">
                Ph: {companyPhone}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="mt-5 flex-row items-start">
          <View className="flex-1 pr-2">
            <IdRow label="Name" value={employeeName(employee).toUpperCase()} bold large numberOfLines={1} />
            <IdRow label="Rank" value={employee.designation_name} numberOfLines={1} />
            <IdRow label="ID" value={employee.employee_code} numberOfLines={1} />
            <IdRow label="Blood Grp" value={employee.blood_group} numberOfLines={1} />
            <IdRow
              label="D.O.B"
              value={employee.date_of_birth ? formatDate(employee.date_of_birth) : undefined}
              numberOfLines={1}
            />
            <IdRow label="Site" value={siteName} numberOfLines={1} />
            <IdRow
              label="Address"
              value={employee.address}
              numberOfLines={2}
              multiline
              valueStyle={signature ? { paddingRight: 82 } : undefined}
            />
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
            <Text style={{ marginTop: 2, fontSize: 8, fontWeight: '600', letterSpacing: 0.3, color: '#64748b' }}>
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
