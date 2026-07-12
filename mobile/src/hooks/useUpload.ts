import { useMutation } from '@tanstack/react-query';
import type { ImagePickerAsset } from 'expo-image-picker';
import { api } from '@/api/client';

export const useUpload = () =>
  useMutation({
    mutationFn: async (asset: ImagePickerAsset) => {
      const form = new FormData();
      form.append('file', {
        uri: asset.uri,
        name: asset.fileName ?? 'photo.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as unknown as Blob);
      const { data } = await api.post<{ path: string }>('/uploads', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.path;
    },
  });
