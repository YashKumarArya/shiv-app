import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { z } from 'zod';
import { api, TOKEN_KEY, USER_KEY } from '@/api/client';
import { userSchema, type User } from '@/api/types';
import { storage } from '@/lib/storage';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const loginResponseSchema = z.object({ token: z.string().min(1), user: userSchema });

const clearStoredSession = async () => {
  const results = await Promise.allSettled([
    storage.remove(TOKEN_KEY),
    storage.remove(USER_KEY),
  ]);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw new Error('Could not completely remove the saved session');
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (response) => response,
      (error: unknown) => {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          void clearStoredSession()
            .catch(() => undefined)
            .finally(() => {
              queryClient.clear();
              setUser(null);
            });
        }
        return Promise.reject(error);
      },
    );
    return () => api.interceptors.response.eject(interceptor);
  }, [queryClient]);

  useEffect(() => {
    let mounted = true;
    const restoreSession = async () => {
      try {
        const [token, storedUser] = await Promise.all([
          storage.get(TOKEN_KEY),
          storage.get(USER_KEY),
        ]);
        if (!token || !storedUser) {
          await clearStoredSession().catch(() => undefined);
          return;
        }

        const parsed = userSchema.safeParse(JSON.parse(storedUser));
        if (!parsed.success) {
          await clearStoredSession().catch(() => undefined);
          return;
        }

        let restoredUser = parsed.data;
        try {
          const current = userSchema.safeParse((await api.get('/auth/me')).data);
          if (!current.success) {
            await clearStoredSession().catch(() => undefined);
            return;
          }
          restoredUser = current.data;
          await storage.set(USER_KEY, JSON.stringify(current.data));
        } catch (error) {
          if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) {
            await clearStoredSession().catch(() => undefined);
            return;
          }
          // A temporary offline start may use the validated cache. The server
          // still re-checks role/status on every data request.
        }
        if (mounted) setUser(restoredUser);
      } catch {
        // Corrupt JSON or unavailable secure storage is a logged-out session,
        // never an app-start crash or a reason to trust partial cached data.
        await clearStoredSession().catch(() => undefined);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void restoreSession();
    return () => { mounted = false; };
  }, []);

  const login = async (email: string, password: string) => {
    const response = loginResponseSchema.safeParse((await api.post('/auth/login', { email, password })).data);
    if (!response.success) throw new Error('The server returned an invalid login response');

    try {
      await storage.set(TOKEN_KEY, response.data.token);
      await storage.set(USER_KEY, JSON.stringify(response.data.user));
    } catch {
      await clearStoredSession().catch(() => undefined);
      throw new Error('Could not securely save the login session');
    }
    queryClient.clear();
    setUser(response.data.user);
  };

  const logout = async () => {
    try {
      await clearStoredSession();
    } finally {
      queryClient.clear();
      setUser(null);
    }
  };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
