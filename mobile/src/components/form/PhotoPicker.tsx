import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { ActivityIndicator, Alert, Image, Platform, Pressable, Text, View } from 'react-native';
import { errorMessage, fileUrl } from '@/api/client';
import { useUpload } from '@/hooks/useUpload';
import { confirmAction } from '@/lib/confirm';
import { notify } from '@/lib/notify';
import { depth } from '@/components/ui/depth';

interface Props<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
}

type Source = 'camera' | 'library';

/** Captures or picks an image, uploads it, and stores the returned path in the form. */
export const PhotoPicker = <T extends FieldValues>({ control, name, label }: Props<T>) => {
  const upload = useUpload();

  const pick = async (source: Source, onChange: (path: string) => void) => {
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        notify(
          source === 'camera' ? 'Camera access needed' : 'Photo access needed',
          `Allow access in your device settings to ${source === 'camera' ? 'take' : 'choose'} a photo.`,
        );
        return;
      }

      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.75,
        // Freeform crop (no fixed aspect) since this same picker is used for
        // portrait employee photos, rectangular documents, and wide signatures.
        allowsEditing: true,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(pickerOptions)
          : await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (result.canceled || !result.assets[0]) return;

      onChange(await upload.mutateAsync(result.assets[0]));
    } catch (error) {
      notify('Couldn’t add image', errorMessage(error));
    }
  };

  const chooseSource = (onChange: (path: string) => void, replacing = false) => {
    if (Platform.OS === 'web') {
      void pick('library', onChange);
      return;
    }
    Alert.alert(replacing ? `Replace ${label}` : `Add ${label}`, 'Choose where to get the image from.', [
      { text: 'Take photo', onPress: () => void pick('camera', onChange) },
      { text: 'Choose from library', onPress: () => void pick('library', onChange) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value }, fieldState: { error } }) => (
        <View className="mb-4">
          <Text className="mb-2 text-sm font-semibold text-slate-700">{label}</Text>
          {value ? (
            <>
              <View
                style={depth.subtle}
                className={`h-44 overflow-hidden rounded-2xl border bg-slate-100 ${
                  error ? 'border-red-400' : 'border-slate-200'
                }`}
              >
                <Image
                  source={{ uri: fileUrl(String(value)) }}
                  resizeMode="cover"
                  accessibilityLabel={`${label} preview`}
                  className="h-full w-full"
                />
                {upload.isPending ? (
                  <View className="absolute inset-0 items-center justify-center bg-slate-950/45">
                    <ActivityIndicator color="#ffffff" />
                    <Text className="mt-2 font-medium text-white">Uploading…</Text>
                  </View>
                ) : null}
              </View>
              <View className="mt-2 flex-row gap-2">
                <Pressable
                  onPress={() => chooseSource(onChange, true)}
                  disabled={upload.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`Replace ${label}`}
                  className="min-h-12 flex-1 flex-row items-center justify-center rounded-xl bg-slate-100 px-3 active:bg-slate-200"
                >
                  <Ionicons name="camera-outline" size={19} color="#334155" />
                  <Text className="ml-2 font-semibold text-slate-700">Replace</Text>
                </Pressable>
                <Pressable
                  onPress={() => confirmAction({
                    title: `Remove ${label}?`,
                    message: 'You can add another image before saving.',
                    confirmText: 'Remove',
                    destructive: true,
                    onConfirm: () => onChange(''),
                  })}
                  disabled={upload.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${label}`}
                  className="min-h-12 flex-1 flex-row items-center justify-center rounded-xl bg-red-50 px-3 active:bg-red-100"
                >
                  <Ionicons name="trash-outline" size={19} color="#dc2626" />
                  <Text className="ml-2 font-semibold text-red-600">Remove</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View
              style={depth.subtle}
              className={`rounded-2xl border border-dashed bg-slate-50 p-4 ${
                error ? 'border-red-400' : 'border-slate-300'
              }`}
            >
              <View className="mb-3 items-center py-2">
                <View className="h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                  {upload.isPending ? (
                    <ActivityIndicator color="#2563eb" />
                  ) : (
                    <Ionicons name="image-outline" size={24} color="#2563eb" />
                  )}
                </View>
                <Text className="mt-2 text-sm text-slate-500">
                  {upload.isPending ? 'Uploading image…' : 'Take a new photo or choose an existing one'}
                </Text>
              </View>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => void pick('camera', onChange)}
                  disabled={upload.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`Take ${label} photo`}
                  className="min-h-12 flex-1 flex-row items-center justify-center rounded-xl bg-blue-600 px-3 active:bg-blue-700"
                >
                  <Ionicons name="camera-outline" size={19} color="#ffffff" />
                  <Text className="ml-2 font-semibold text-white">Camera</Text>
                </Pressable>
                <Pressable
                  onPress={() => void pick('library', onChange)}
                  disabled={upload.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${label} from library`}
                  className="min-h-12 flex-1 flex-row items-center justify-center rounded-xl bg-white px-3 active:bg-slate-100"
                >
                  <Ionicons name="images-outline" size={19} color="#334155" />
                  <Text className="ml-2 font-semibold text-slate-700">Library</Text>
                </Pressable>
              </View>
            </View>
          )}
          {error ? (
            <Text accessibilityLiveRegion="polite" className="mt-1.5 text-xs font-medium text-red-600">
              {error.message}
            </Text>
          ) : null}
        </View>
      )}
    />
  );
};
