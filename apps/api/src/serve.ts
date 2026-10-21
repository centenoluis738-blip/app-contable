import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { createApp } from './app.js';
import { config } from './config.js';

/**
 * Servidor de publicación: una sola dirección para todo el proyecto.
 *   /api   → la API
 *   /guia  → el sitio de ayuda (exportación estática de apps/help)
 *   /      → la app web (compilación de apps/web)
 * Así la app y la ayuda llaman a la API en el mismo dominio y no hace falta configurar CORS.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const webDir = path.join(root, 'apps/web/dist');
const helpDir = path.join(root, 'apps/help/out');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use('/api', createApp());
// El sitio de ayuda usa scripts en línea de Next.js, así que aquí no se aplica la CSP por defecto de helmet.
app.use(helmet({ contentSecurityPolicy: false }));
app.use('/guia', express.static(helpDir));
app.use('/guia', (_req, res) => res.status(404).sendFile(path.join(helpDir, '404.html')));
app.use(express.static(webDir));
// Las rutas de la app web (/venta, /facturas/...) las resuelve React en el navegador.
app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(webDir, 'index.html')) : next()));

app.listen(config.port, () => {
  console.log(`App contable publicada en el puerto ${config.port} (API en /api, ayuda en /guia)`);
});
