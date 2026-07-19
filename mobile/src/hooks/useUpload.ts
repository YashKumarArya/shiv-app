import { useMutation } from '@tanstack/react-query';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Platform } from 'react-native';
import { api } from '@/api/client';

interface UploadInput {
  asset: ImagePickerAsset;
  /** Server strips the paper background, keeping only dark ink, transparent PNG out. */
  extractSignature?: boolean;
}

export const useUpload = () =>
  useMutation({
    mutationKey: ['upload'],
    mutationFn: async ({ asset, extractSignature }: UploadInput) => {
      const form = new FormData();
      if (Platform.OS === 'web') {
        const file = asset.file ?? await (await fetch(asset.uri)).blob();
        form.append('file', file, asset.fileName ?? 'photo.jpg');
      } else {
        form.append('file', {
          uri: asset.uri,
          name: asset.fileName ?? 'photo.jpg',
          type: asset.mimeType ?? 'image/jpeg',
        } as unknown as Blob);
      }
      if (extractSignature) form.append('type', 'signature');
      const { data } = await api.post<{ path: string }>('/uploads', form, {
        headers: Platform.OS === 'web' ? undefined : { 'Content-Type': 'multipart/form-data' },
        // Photos need more time than normal JSON requests on slow mobile data.
        timeout: 60_000,
      });
      return data.path;
    },
  });
