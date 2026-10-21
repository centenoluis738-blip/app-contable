import type { Metadata } from 'next';
import Link from 'next/link';
import { CATEGORIES, getArticles } from '@/lib/articles';
import { HelpSearch } from '@/components/HelpSearch';

export const metadata: Metadata = { title: 'Centro de ayuda', description: 'Guías paso a paso para usar la App Contable.' };

export default function HelpCenter() {
  const items = getArticles().map(({ slug, title, summary, category, text }) => ({ slug, title, summary, category, text }));
  return (
    <div className="wrap narrow-top">
      <h1>¿En qué te ayudamos?</h1>
      <HelpSearch items={items} categories={CATEGORIES} />
      <p className="muted center">¿No encuentras la respuesta? <Link href="/contacto/">Contacta con soporte</Link>.</p>
    </div>
  );
}
