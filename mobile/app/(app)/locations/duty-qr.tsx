import { useQuery } from '@tanstack/react-query';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { api, errorMessage } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { notify } from '@/lib/notify';
import { qrSvgMarkup } from '@/lib/qr';

interface DutyCodes {
  site_name: string;
  start_payload: string;
  end_payload: string;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

export default function DutyQrSheet() {
  const { location_id: locationId } = useLocalSearchParams<{ location_id?: string }>();
  const [action, setAction] = useState<'print' | 'share' | null>(null);
  const codes = useQuery<DutyCodes>({
    queryKey: ['duty/sites', locationId, 'qr'],
    queryFn: async () => (await api.get(`/duty/sites/${locationId}/qr`)).data,
    enabled: !!locationId,
  });

  const produce = async (which: 'print' | 'share') => {
    setAction(which);
    try {
      const fresh: DutyCodes = (await api.get(`/duty/sites/${locationId}/qr`)).data;
      const name = escapeHtml(fresh.site_name);
      const cards = ([['START DUTY', fresh.start_payload], ['END DUTY', fresh.end_payload]] as const)
        .map(([label, payload]) => `<section><h2>${label}</h2>${qrSvgMarkup(payload, 230)}<p>${name}</p><small>Scan only at this site. Keep this sticker at its assigned entrance or exit.</small></section>`)
        .join('');
      const { uri } = await Print.printToFileAsync({
        width: 595, height: 842,
        html: `<html><head><style>body{font-family:sans-serif;text-align:center;color:#102a43;margin:28px}h1{font-size:24px}main{display:flex;gap:24px;margin-top:36px}section{width:50%;border:2px solid #102a43;border-radius:16px;padding:16px}h2{font-size:23px}p{font-size:18px;font-weight:bold}small{font-size:12px}</style></head><body><h1>${name} · Duty QR Codes</h1><main>${cards}</main></body></html>`,
      });
      if (which === 'print') await Print.printAsync({ uri });
      else if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
      else notify('Sharing unavailable', 'This device cannot share files.');
    } catch (error) {
      notify('Couldn’t create QR sheet', errorMessage(error));
    } finally {
      setAction(null);
    }
  };

  return (
    <Screen scroll loading={codes.isLoading} error={codes.isError ? errorMessage(codes.error) : undefined}
      onRetry={() => void codes.refetch()} footer={codes.data ? (
        <View className="gap-2">
          <Button title="Print duty stickers" icon="print-outline" onPress={() => void produce('print')} loading={action === 'print'} />
          <Button title="Share PDF" variant="secondary" icon="share-outline" onPress={() => void produce('share')} loading={action === 'share'} />
        </View>
      ) : undefined}>
      {codes.data ? (
        <View className="gap-5">
          <Text className="text-base text-slate-600">Print both codes and place them at {codes.data.site_name}. Guards scan Start Duty on arrival and End Duty when leaving.</Text>
          {([['Start Duty', codes.data.start_payload], ['End Duty', codes.data.end_payload]] as const).map(([label, payload]) => (
            <View key={label} className="items-center rounded-2xl bg-white p-5">
              <Text className="mb-3 text-lg font-bold text-slate-900">{label}</Text>
              <SvgXml xml={qrSvgMarkup(payload, 220)} width={220} height={220} />
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
