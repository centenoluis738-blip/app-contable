/** Sitio estático: se puede publicar en cualquier hosting (Vercel, Netlify, S3, Azure Static Web Apps). */
// NEXT_PUBLIC_BASE_PATH permite servirlo dentro de otra ruta, por ejemplo /guia en el servidor de la app.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const nextConfig = { output: 'export', trailingSlash: true, images: { unoptimized: true }, basePath };
export default nextConfig;
