import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_URL, SITE_NAME } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${SITE_NAME} · Contabilidad fácil para tu negocio`, template: `%s · ${SITE_NAME}` },
  description: 'Factura, registra gastos, concilia tu banco y conoce tus impuestos sin ser contador. Centro de ayuda con guías paso a paso.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="site-header">
          <div className="wrap nav">
            <Link href="/" className="logo">{SITE_NAME}</Link>
            <nav>
              <Link href="/ayuda/">Centro de ayuda</Link>
              <Link href="/preguntas-frecuentes/">Preguntas frecuentes</Link>
              <Link href="/contacto/">Contacto</Link>
              <a className="btn" href={`${APP_URL}/login`}>Entrar</a>
              <a className="btn primary" href={`${APP_URL}/registro`}>Pruébala gratis</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap footer-grid">
            <div><strong>{SITE_NAME}</strong><p>Contabilidad sencilla para autónomos y pymes.</p></div>
            <div><h4>Ayuda</h4><Link href="/ayuda/">Guías</Link><Link href="/glosario/">Glosario contable</Link><Link href="/contacto/">Soporte</Link></div>
            <div><h4>Legal</h4><Link href="/legal/privacidad/">Aviso de privacidad</Link><Link href="/legal/terminos/">Términos y condiciones</Link></div>
          </div>
        </footer>
      </body>
    </html>
  );
}
