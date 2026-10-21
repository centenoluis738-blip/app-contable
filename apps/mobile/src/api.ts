import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// En un teléfono físico "localhost" no apunta a tu computadora: usa la IP de tu red (p. ej. http://192.168.1.20:4000).
export const API_URL: string = (Constants.expoConfig?.extra as { apiUrl?: string })?.apiUrl ?? 'http://localhost:4000';
export const HELP_URL: string = (Constants.expoConfig?.extra as { helpUrl?: string })?.helpUrl ?? 'http://localhost:3000';

let token: string | null = null;
let companyId: string | null = null;

export async function loadSession() {
  token = await SecureStore.getItemAsync('token');
  companyId = await SecureStore.getItemAsync('companyId');
  return { token, companyId };
}

export async function setSession(t: string | null, c: string | null) {
  token = t;
  companyId = c;
  if (t) await SecureStore.setItemAsync('token', t); else await SecureStore.deleteItemAsync('token');
  if (c) await SecureStore.setItemAsync('companyId', c); else await SecureStore.deleteItemAsync('companyId');
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (companyId) headers['X-Company-Id'] = companyId;
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}${path}`, { method, headers, body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined });
  const data = res.status === 204 ? undefined : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.details?.[0]?.message ?? data?.error ?? 'Error de conexión');
  return data as T;
}

export const fmt = (v: string | number, currency = 'NIO') => {
  try {
    return new Intl.NumberFormat('es-NI', { style: 'currency', currency }).format(Number(v));
  } catch {
    return `${Number(v).toFixed(2)} ${currency}`;
  }
};
