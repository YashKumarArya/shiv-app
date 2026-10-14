import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { usePatrolQueue } from '@/hooks/usePatrolQueue';
import { enqueue } from '@/lib/patrolQueue';
import { parseDutyQr } from '@/lib/qr';
import { notify } from '@/lib/notify';

type Phase = 'scanning' | 'selfie' | 'saving';

export default function ScanDuty() {
  const { kind, hash } = useLocalSearchParams<{ kind?: 'start' | 'end'; hash?: string }>();
  const router = useRouter();
  const queue = usePatrolQueue();
  const camera = useRef<CameraView>(null);
  const handling = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('scanning');
  const [payload, setPayload] = useState('');

  const scanned = async ({ data }: { data: string }) => {
    if (handling.current || phase !== 'scanning') return;
    handling.current = true;
    const parsed = parseDutyQr(data);
    if (!parsed || parsed.kind !== kind) {
      notify('Wrong QR code', `Scan the site's ${kind === 'end' ? 'End Duty' : 'Start Duty'} sticker.`);
      handling.current = false;
      return;
    }
    const scannedHash = (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, parsed.token)).slice(0, 32);
    if (scannedHash !== hash) {
      notify('Wrong site', 'This QR belongs to another site. Scan the sticker at your posted site.');
      handling.current = false;
      return;
    }
    setPayload(data);
    setPhase('selfie');
  };

  const capture = async () => {
    if (!payload || phase !== 'selfie') return;
    setPhase('saving');
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.6, skipProcessing: true });
      if (!photo?.uri) throw new Error('The camera did not return a photo');
      await enqueue({
        kind: 'duty', dutyKind: kind!, id: Crypto.randomUUID(), qrPayload: payload,
        scannedAt: new Date().toISOString(), photoUri: photo.uri,
      });
      queue.retry();
      notify('Duty scan saved', 'It will be confirmed when your phone has a connection.');
      router.back();
    } catch (error) {
      notify('Couldn’t save duty scan', error instanceof Error ? error.message : 'Try again.');
      setPhase('selfie');
    }
  };

  if (!kind || !hash) return <Screen error="Open this scanner from your duty screen." />;
  if (!permission) return <Screen className="items-center justify-center"><ActivityIndicator /></Screen>;
  if (!permission.granted) return (
    <Screen className="justify-center px-6">
      <Text className="mb-4 text-center text-base text-slate-800">Camera access is needed to scan the duty sticker and take your photo.</Text>
      <Button title="Allow camera" onPress={() => void requestPermission()} />
    </Screen>
  );

  return (
    <View className="flex-1 bg-slate-950">
      <CameraView ref={camera} style={{ flex: 1 }} facing={phase === 'scanning' ? 'back' : 'front'}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={phase === 'scanning' ? (result) => void scanned(result) : undefined} />
      <View className="absolute inset-x-0 top-0 p-4">
        <Text className="rounded-2xl bg-slate-950/70 p-4 text-center text-base font-bold text-white">
          {phase === 'scanning' ? `Scan ${kind === 'start' ? 'Start' : 'End'} Duty QR at your site` : 'Take your photo at the site'}
        </Text>
      </View>
      <View className="absolute inset-x-0 bottom-0 p-6">
        {phase === 'scanning' ? <Button title="Cancel" variant="secondary" onPress={() => router.back()} /> : (
          <Pressable onPress={() => void capture()} disabled={phase === 'saving'} accessibilityRole="button"
            accessibilityLabel="Take duty photo" className="h-20 w-20 items-center justify-center self-center rounded-full border-4 border-white bg-white/30">
            {phase === 'saving' ? <ActivityIndicator color="white" /> : <View className="h-14 w-14 rounded-full bg-white" />}
          </Pressable>
        )}
      </View>
    </View>
  );
}
