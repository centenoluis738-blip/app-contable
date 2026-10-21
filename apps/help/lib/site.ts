// Sin la barra final, para que `${APP_URL}/registro` no quede como //registro cuando la app está en la raíz ("/").
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
/** Ruta donde se publica el sitio de ayuda ('' si va en la raíz del dominio). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const SITE_NAME = 'App Contable';
