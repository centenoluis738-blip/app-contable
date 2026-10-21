const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
export const HELP_URL = import.meta.env.VITE_HELP_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: { field: string; message: string }[]) {
    super(message);
  }
}

const session = {
  get token() { return localStorage.getItem('token'); },
  get companyId() { return localStorage.getItem('companyId'); },
};

export function saveSession(token: string | null, companyId?: string | null) {
  if (token) localStorage.setItem('token', token); else localStorage.removeItem('token');
  if (companyId !== undefined) {
    if (companyId) localStorage.setItem('companyId', companyId); else localStorage.removeItem('companyId');
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  if (session.companyId) headers['X-Company-Id'] = session.companyId;
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}${path}`, { method, headers, body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined });
  if (res.status === 401 && session.token) {
    saveSession(null, null);
    window.location.href = '/login';
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Error inesperado', data.details);
  return data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>('GET', path),
  post: <T,>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T,>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T,>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T,>(path: string) => request<T>('DELETE', path),
  /** Descarga un archivo (PDF o CSV) con la sesión y lo abre en otra pestaña. */
  async open(path: string) {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${session.token}`, 'X-Company-Id': session.companyId ?? '' },
    });
    if (!res.ok) throw new ApiError(res.status, 'No se pudo descargar el archivo');
    const url = URL.createObjectURL(await res.blob());
    window.open(url, '_blank');
  },
};
