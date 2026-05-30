import axios from "axios";
import { supabase } from "@/integrations/supabase/client";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api";

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// Anexa o token JWT do Supabase em cada requisição
apiClient.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Tenta renovar a sessão em caso de 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && data.session) {
        original.headers.Authorization = `Bearer ${data.session.access_token}`;
        return apiClient(original);
      }
    }
    return Promise.reject(error);
  }
);

// Helper compatível com o uso anterior (api.get/post/...)
export const api = {
  get: <T = unknown>(path: string) => apiClient.get<T>(path).then((r) => r.data),
  post: <T = unknown>(path: string, body: unknown) => apiClient.post<T>(path, body).then((r) => r.data),
  patch: <T = unknown>(path: string, body: unknown) => apiClient.patch<T>(path, body).then((r) => r.data),
  put: <T = unknown>(path: string, body: unknown) => apiClient.put<T>(path, body).then((r) => r.data),
  delete: <T = unknown>(path: string) => apiClient.delete<T>(path).then((r) => r.data),
};
