import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const TOKEN_KEY = 'auth_token';
export const USER_KEY = 'auth_user';

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export const api = axios.create({ baseURL });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Uploaded files are served from the API host, outside the /api prefix. */
export const fileUrl = (path?: string | null) =>
  path ? baseURL.replace(/\/api$/, '') + path : undefined;

export const errorMessage = (error: unknown) =>
  axios.isAxiosError(error)
    ? ((error.response?.data as { error?: string })?.error ?? error.message)
    : 'Something went wrong';
