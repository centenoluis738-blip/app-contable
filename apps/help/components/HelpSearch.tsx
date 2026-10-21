'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

interface Item { slug: string; title: string; summary: string; category: string; text: string }
interface Category { id: string; name: string; description: string }

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Buscador del centro de ayuda: filtra en el navegador, sin servidor. */
export function HelpSearch({ items, categories }: { items: Item[]; categories: Category[] }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const words = normalize(q).split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    return items
      .map((a) => {
        const title = normalize(a.title);
        const body = normalize(`${a.summary} ${a.text}`);
        const score = words.reduce((s, w) => s + (title.includes(w) ? 3 : 0) + (body.includes(w) ? 1 : 0), 0);
        return { a, score, all: words.every((w) => title.includes(w) || body.includes(w)) };
      })
      .filter((r) => r.all)
      .sort((x, y) => y.score - x.score)
      .map((r) => r.a);
  }, [q, items]);

  return (
    <>
      <input className="search" type="search" placeholder="¿Qué necesitas? Ej.: anular factura, IVA, extracto" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {results ? (
        <div className="results">
          {results.length ? results.map((a) => (
            <Link key={a.slug} href={`/ayuda/${a.slug}/`} className="card result"><h3>{a.title}</h3><p>{a.summary}</p></Link>
          )) : <p className="muted">No encontramos artículos. <Link href="/contacto/">Escríbenos</Link> y te ayudamos.</p>}
        </div>
      ) : (
        <div className="categories">
          {categories.map((c) => {
            const list = items.filter((a) => a.category === c.id);
            if (!list.length) return null;
            return (
              <div className="card" key={c.id}>
                <h3>{c.name}</h3>
                <p className="muted">{c.description}</p>
                <ul>{list.map((a) => <li key={a.slug}><Link href={`/ayuda/${a.slug}/`}>{a.title}</Link></li>)}</ul>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
