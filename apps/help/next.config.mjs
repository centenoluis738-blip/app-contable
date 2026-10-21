/** Sitio estático: se puede publicar en cualquier hosting (Vercel, Netlify, S3, Azure Static Web Apps). */
const nextConfig = { output: 'export', trailingSlash: true, images: { unoptimized: true } };
export default nextConfig;
