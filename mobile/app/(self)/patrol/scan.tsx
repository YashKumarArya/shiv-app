import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import type { GuardCheckpoint, PatrolToday } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { depth } from '@/components/ui/depth';
import { usePatrolQueue } from '@/hooks/usePatrolQueue';
import { distanceMetres, getCurrentPosition, type Coordinates } from '@/lib/location';
import { notify } from '@/lib/notify';
import { enqueue } from '@/lib/patrolQueue';
import { parseCheckpointQr } from '@/lib/qr';

type Phase = 'scanning' | 'checking' | 'selfie' | 'saving';

/** Must match qrTokenHash on the server. */
const tokenHash = async (token: string) =>
  (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token)).slice(0, 32);

export default function ScanCheckpoint() {
  const router = useRouter();
  const params = useLocalSearchParams<{ route_id?: string; client_uuid?: string }>();
  const routeId = Number(params.route_id);
  const clientUuid = params.client_uuid ?? '';

  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('scanning');
  const [matched, setMatched] = useState<GuardCheckpoint | null>(null);
  // The exact string read from the sticker. The server resolves the checkpoint
  // from this, so it is forwarded verbatim rather than rebuilt from the match.
  const [scannedPayload, setScannedPayload] = useState('');
  const [position, setPosition] = useState<Coordinates | null>(null);
  const camera = useRef<CameraView>(null);
  // The scanner fires continuously while a code is in frame; this stops one
  // sticker producing a burst of duplicate handling.
  const handling = useRef(false);
  const queue = usePatrolQueue();

  const patrol = useQuery<PatrolToday>({
    queryKey: ['patrols/my/today'],
    queryFn: async () => (await api.get('/patrols/my/today')).data,
  });
  const route = patrol.data?.routes.find((entry) => entry.id === routeId);

  const reset = () => {
    handling.current = false;
    setMatched(null);
    setScannedPayload('');
    setPosition(null);
    setPhase('scanning');
  };

  const onScanned = async ({ data }: { data: string }) => {
    if (handling.current || phase !== 'scanning' || !route) return;
    handling.current = true;

    try {
      const token = parseCheckpointQr(data);
      if (!token) {
        notify('Not a checkpoint code', 'That QR code is not a patrol checkpoint. Try the sticker again.');
        reset();
        return;
      }

      const hash = await tokenHash(token);
      const checkpoint = route.checkpoints.find((entry) => entry.qr_token_hash === hash);
      if (!checkpoint) {
        notify(
          'Wrong checkpoint',
          'That sticker is not on the route you are patrolling. Check you are at the right point.',
        );
        reset();
        return;
      }

      setMatched(checkpoint);
      setScannedPayload(data);
      setPhase('checking');

      // Verified here as well as on the server so the guard finds out while
      // still standing at the gate, not hours later when the queue syncs.
      let fix: Coordinates | null = null;
      if (checkpoint.latitude != null && checkpoint.longitude != null) {
        fix = await getCurrentPosition();
        const away = distanceMetres(fix, {
          latitude: Number(checkpoint.latitude),
          longitude: Number(checkpoint.longitude),
        });
        if (away > route.geofence_metres) {
          notify(
            'Too far from the checkpoint',
            `You are about ${Math.round(away)} m from ${checkpoint.checkpoint_name}. Walk to the sticker and scan again.`,
          );
          reset();
          return;
        }
      }

      setPosition(fix);
      setPhase('selfie');
      handling.current = false;
    } catch (error) {
      notify('Couldn’t check this checkpoint', errorMessage(error));
      reset();
    }
  };

  const captureSelfie = async () => {
    if (!matched || !scannedPayload) return;
    setPhase('saving');
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.6, skipProcessing: true });
      if (!photo?.uri) throw new Error('The camera did not return a photo');

      await enqueue({
        kind: 'scan',
        id: Crypto.randomUUID(),
        sessionClientUuid: clientUuid,
        qrPayload: scannedPayload,
        scannedAt: new Date().toISOString(),
        photoUri: photo.uri,
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
        checkpointId: matched.id,
        checkpointName: matched.checkpoint_name,
      });
      queue.retry();
      router.back();
    } catch (error) {
      notify('Couldn’t save this checkpoint', errorMessage(error));
      setPhase('selfie');
    }
  };

  if (!permission) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color="#2457d6" />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen className="justify-center px-6">
        <View style={depth.raised} className="items-center rounded-3xl border border-slate-200 bg-white p-8">
          <Ionicons name="camera-outline" size={34} color="#2457d6" />
          <Text className="mt-3 text-center text-base font-extrabold text-slate-800">
            Camera access needed
          </Text>
          <Text className="mt-1 text-center text-sm leading-5 text-slate-500">
            The camera reads the checkpoint sticker and takes the photo that proves you were there.
          </Text>
          <View className="mt-4 w-full">
            <Button title="Allow camera" icon="checkmark" onPress={() => void requestPermission()} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <View className="flex-1 bg-slate-950">
      <CameraView
        ref={camera}
        style={{ flex: 1 }}
        facing={phase === 'selfie' || phase === 'saving' ? 'front' : 'back'}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={phase === 'scanning' ? (result) => void onScanned(result) : undefined}
      />

      <View className="absolute inset-x-0 top-0 p-4">
        <View className="rounded-2xl bg-slate-950/70 p-4">
          <Text className="text-center text-base font-extrabold text-white">
            {phase === 'scanning'
              ? 'Point at the checkpoint sticker'
              : phase === 'checking'
                ? 'Checking you are at the checkpoint…'
                : `Now take your photo at ${matched?.checkpoint_name}`}
          </Text>
          {matched && phase !== 'scanning' ? (
            <Text className="mt-1 text-center text-sm text-white/80">{matched.checkpoint_name}</Text>
          ) : null}
        </View>
      </View>

      {phase === 'scanning' ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <View className="h-60 w-60 rounded-3xl border-4 border-white/80" />
        </View>
      ) : null}

      <View className="absolute inset-x-0 bottom-0 p-6">
        {phase === 'checking' ? (
          <View className="items-center rounded-2xl bg-slate-950/70 p-5">
            <ActivityIndicator color="#ffffff" />
            <Text className="mt-2 font-semibold text-white">Getting your location…</Text>
          </View>
        ) : phase === 'selfie' || phase === 'saving' ? (
          <Pressable
            onPress={() => void captureSelfie()}
            disabled={phase === 'saving'}
            accessibilityRole="button"
            accessibilityLabel="Take your photo at this checkpoint"
            className="h-20 w-20 items-center justify-center self-center rounded-full border-4 border-white bg-white/30 active:bg-white/50"
          >
            {phase === 'saving' ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <View className="h-14 w-14 rounded-full bg-white" />
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            className="min-h-12 items-center justify-center rounded-2xl bg-slate-950/70 px-4"
          >
            <Text className="font-bold text-white">Cancel</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
