import { useMutation } from '@tanstack/react-query';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Platform } from 'react-native';
import { api } from '@/api/client';

export const useUpload = () =>
  useMutation({
    mutationKey: ['upload'],
    mutationFn: async (asset: ImagePickerAsset) => {
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
      const { data } = await api.post<{ path: string }>('/uploads', form, {
        headers: Platform.OS === 'web' ? undefined : { 'Content-Type': 'multipart/form-data' },
      });
      return data.path;
    },
  });
