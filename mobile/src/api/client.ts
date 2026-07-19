import axios from 'axios';
import { storage } from '@/lib/storage';

export const TOKEN_KEY = 'auth_token';
export const USER_KEY = 'auth_user';

const configuredBaseURL = process.env.EXPO_PUBLIC_API_URL;
const baseURL = configuredBaseURL ?? 'http://localhost:4000/api';
const privateDevelopmentUrl = /^http:\/\/(?:localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i;

if (!__DEV__ && (!configuredBaseURL || privateDevelopmentUrl.test(configuredBaseURL))) {
  throw new Error('Release build requires a public EXPO_PUBLIC_API_URL. Use the preview EAS build profile.');
}

export const api = axios.create({
  baseURL,
  // Installed apps must not leave login, save, or refresh spinners running
  // forever on captive Wi-Fi or a half-open mobile connection.
  timeout: 20_000,
});

api.interceptors.request.use(async (config) => {
  const token = await storage.get(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** API records contain short-lived signed file paths served outside the /api prefix. */
export const fileUrl = (path?: string | null) =>
  path
    ? /^(?:https?:|data:|file:|content:)/i.test(path)
      ? path
      : baseURL.replace(/\/api$/, '') + path
    : undefined;

export const errorMessage = (error: unknown) =>
  axios.isAxiosError(error)
    ? ((error.response?.data as { error?: string })?.error ?? error.message)
    : error instanceof Error
      ? error.message
      : 'Something went wrong';
