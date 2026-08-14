import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Print from 'expo-print';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { api, errorMessage } from '@/api/client';
import type { PatrolCheckpoint, PatrolRoute } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';
import { notify } from '@/lib/notify';
import {
  A4_HEIGHT_POINTS,
  A4_WIDTH_POINTS,
  STICKERS_PER_A4_PAGE,
  buildCheckpointQrSheetHtml,
} from '@/lib/patrolQrSheet';
import { checkpointQrPayload, qrSvgMarkup } from '@/lib/qr';

type Action = 'print' | 'share';

export default function CheckpointQrSheet() {
  const { route_id: routeIdParam } = useLocalSearchParams<{ route_id?: string }>();
  const routeId = Number(routeIdParam);
  const [action, setAction] = useState<Action | null>(null);

  const route = useQuery<PatrolRoute>({
    queryKey: ['patrols/routes', String(routeId)],
    queryFn: async () => (await api.get(`/patrols/routes/${routeId}`)).data,
    enabled: routeId > 0,
  });

  const checkpoints = useQuery<PatrolCheckpoint[]>({
    queryKey: ['patrols/checkpoints', { route_id: routeId }],
    queryFn: async () =>
      (await api.get('/patrols/checkpoints', { params: { route_id: routeId, limit: 200 } })).data,
    enabled: routeId > 0,
  });

  // Inactive checkpoints are excluded: their stickers no longer scan, so
  // printing them would put dead codes on the wall.
  const printable = (checkpoints.data ?? []).filter(
    (checkpoint) => checkpoint.is_active && checkpoint.qr_token,
  );

  const produce = async (which: Action) => {
    setAction(which);
    try {
      // Re-read rather than trusting the cache: printing a token that was
      // regenerated or retired on another device puts a dead sticker on a gate.
      const fresh: PatrolCheckpoint[] = (
        await api.get('/patrols/checkpoints', { params: { route_id: routeId, limit: 200 } })
      ).data;
      const stickers = fresh
        .filter((checkpoint) => checkpoint.is_active && checkpoint.qr_token)
        .map((checkpoint) => ({
          checkpoint,
          routeName: route.data?.route_name ?? '',
          siteName: route.data?.site_name ?? '',
        }));
      if (!stickers.length) throw new Error('This route has no active checkpoints to print');

      const { uri } = await Print.printToFileAsync({
        width: A4_WIDTH_POINTS,
        height: A4_HEIGHT_POINTS,
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        html: buildCheckpointQrSheetHtml(stickers),
      });

      if (which === 'print') {
        await Print.printAsync({ uri });
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${stickers.length} checkpoint QR stickers`,
        });
      } else {
        notify('Sharing unavailable', 'This device cannot share files.');
      }
    } catch (error) {
      notify(which === 'print' ? 'Couldn’t print stickers' : 'Couldn’t export stickers', errorMessage(error));
    } finally {
      setAction(null);
    }
  };

  if (route.isLoading || checkpoints.isLoading) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color="#2457d6" />
      </Screen>
    );
  }
  if (route.isError || checkpoints.isError) {
    return (
      <Screen
        error={errorMessage(route.error ?? checkpoints.error)}
        onRetry={() => {
          void route.refetch();
          void checkpoints.refetch();
        }}
      />
    );
  }

  const pages = Math.ceil(printable.length / STICKERS_PER_A4_PAGE);

  return (
    <Screen
      footer={printable.length ? (
        <View className="gap-2">
          <Button
            title="Print stickers"
            icon="print-outline"
            onPress={() => void produce('print')}
            loading={action === 'print'}
            disabled={action !== null}
          />
          <Button
            title="Save as PDF"
            variant="secondary"
            icon="share-outline"
            onPress={() => void produce('share')}
            loading={action === 'share'}
            disabled={action !== null}
          />
        </View>
      ) : undefined}
    >
      {printable.length === 0 ? (
        <EmptyState
          title="Nothing to print"
          message="Add active checkpoints to this route first."
          icon="qr-code-outline"
        />
      ) : (
        <ScrollView contentContainerClassName="p-4 pb-6">
          <View style={depth.subtle} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
            <Text className="text-base font-extrabold text-slate-800">
              {printable.length} sticker{printable.length === 1 ? '' : 's'} · {pages} A4 page{pages === 1 ? '' : 's'}
            </Text>
            <Text className="mt-1 text-sm leading-5 text-slate-500">
              Print, cut along the dashed lines, and fix each sticker at its checkpoint. Laminate or use
              weatherproof labels for outdoor points.
            </Text>
            <View className="mt-3 flex-row items-start rounded-xl bg-amber-50 p-3">
              <Ionicons name="warning-outline" size={17} color="#d97706" />
              <Text className="ml-2 flex-1 text-xs leading-5 text-amber-800">
                Each code is unique to its checkpoint and is what proves a guard was physically there.
                Keep spare copies out of circulation.
              </Text>
            </View>
          </View>

          <View className="flex-row flex-wrap justify-between">
            {printable.map((checkpoint) => (
              <View
                key={checkpoint.id}
                style={depth.subtle}
                className="mb-3 w-[48%] items-center rounded-2xl border border-slate-200 bg-white p-3"
              >
                <SvgXml
                  xml={qrSvgMarkup(checkpointQrPayload(checkpoint.qr_token!), 120)}
                  width={120}
                  height={120}
                />
                <Text className="mt-2 text-center text-sm font-bold text-slate-800" numberOfLines={2}>
                  {checkpoint.sequence}. {checkpoint.checkpoint_name}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}
