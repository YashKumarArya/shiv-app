import * as ImagePicker from 'expo-image-picker';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import { errorMessage, fileUrl } from '@/api/client';
import { useUpload } from '@/hooks/useUpload';

interface Props<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
}

/** Picks an image from the library, uploads it, and stores the returned path in the form. */
export const PhotoPicker = <T extends FieldValues>({ control, name, label }: Props<T>) => {
  const upload = useUpload();

  const pick = async (onChange: (path: string) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled) return;
    try {
      onChange(await upload.mutateAsync(result.assets[0]));
    } catch (error) {
      Alert.alert('Upload failed', errorMessage(error));
    }
  };

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value } }) => (
        <View className="mb-3">
          <Text className="mb-1 text-sm font-medium text-slate-600">{label}</Text>
          <Pressable
            onPress={() => pick(onChange)}
            className="h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white"
          >
            {value ? (
              <Image source={{ uri: fileUrl(value) }} className="h-full w-full" />
            ) : (
              <Text className="px-2 text-center text-xs text-slate-400">
                {upload.isPending ? 'Uploading…' : 'Tap to upload'}
              </Text>
            )}
          </Pressable>
        </View>
      )}
    />
  );
};
