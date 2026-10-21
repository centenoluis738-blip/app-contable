import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

export interface Article {
  slug: string;
  title: string;
  summary: string;
  category: string;
  order: number;
  video?: string;
  html: string;
  text: string;
}

const dir = path.join(process.cwd(), 'content', 'articulos');

export const CATEGORIES = [
  { id: 'empezar', name: 'Primeros pasos', description: 'Crea tu cuenta y configura tu negocio' },
  { id: 'ventas', name: 'Ventas y facturación', description: 'Facturas, cobros, clientes y productos' },
  { id: 'compras', name: 'Gastos y compras', description: 'Registra gastos, proveedores y comprobantes' },
  { id: 'bancos', name: 'Bancos', description: 'Importa extractos y concilia movimientos' },
  { id: 'impuestos', name: 'Impuestos en Nicaragua', description: 'Cuota fija, IVA, retenciones, IMI y obligaciones' },
  { id: 'nomina', name: 'Nómina', description: 'INSS, INATEC, IR salarial y prestaciones' },
  { id: 'contabilidad', name: 'Contabilidad y reportes', description: 'Catálogo de cuentas, libros, estados financieros y tipo de cambio' },
  { id: 'cuenta', name: 'Tu cuenta', description: 'Usuarios, permisos y seguridad' },
];

/** Lee todos los artículos en Markdown de content/articulos (se ejecuta al compilar el sitio). */
export function getArticles(): Article[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const { data, content } = matter(fs.readFileSync(path.join(dir, file), 'utf8'));
      return {
        slug: file.replace(/\.md$/, ''),
        title: data.title,
        summary: data.summary ?? '',
        category: data.category ?? 'empezar',
        order: data.order ?? 99,
        video: data.video,
        html: marked.parse(content, { async: false }) as string,
        text: content.replace(/[#*_>`-]/g, ' ').replace(/\s+/g, ' ').trim(),
      };
    })
    .sort((a, b) => a.order - b.order);
}

export const getArticle = (slug: string) => getArticles().find((a) => a.slug === slug);
