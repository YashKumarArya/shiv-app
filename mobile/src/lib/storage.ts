import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// SecureStore has no web implementation; fall back to localStorage there.
const local = (globalThis as any).localStorage;

export const storage =
  Platform.OS === 'web'
    ? {
        get: async (key: string): Promise<string | null> => local?.getItem(key) ?? null,
        set: async (key: string, value: string) => void local?.setItem(key, value),
        remove: async (key: string) => void local?.removeItem(key),
      }
    : {
        get: (key: string) => SecureStore.getItemAsync(key),
        set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
        remove: (key: string) => SecureStore.deleteItemAsync(key),
      };
