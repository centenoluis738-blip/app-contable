import Link from 'next/link';
import { APP_URL } from '@/lib/site';

const FEATURES = [
  ['Facturas con IVA 15 % o cuota fija', 'Factura en córdobas o dólares, con exentos, tasa cero y la retención de IR que te harán.'],
  ['Cuota fija sin enredos', 'La app resta tus retenciones de IR de la cuota y suma el IMI de la alcaldía.'],
  ['Nómina con INSS e INATEC', 'Calcula INSS laboral y patronal, IR salarial, INATEC y provisiones de aguinaldo, vacaciones e indemnización.'],
  ['Banco conciliado', 'Importa tu estado de cuenta y la app te sugiere a qué factura o gasto corresponde cada movimiento.'],
  ['Estados financieros NIIF PYMES', 'Estado de resultados, balance general y flujo de efectivo, exportables a Excel.'],
  ['Libros para legalizar', 'Exporta el libro diario y el libro mayor para tus libros legalizados; nada se borra.'],
];

const PLANS = [
  { name: 'Gratis', price: '0', items: ['1 usuario', 'Hasta 10 facturas al mes', 'Gastos y reportes básicos'] },
  { name: 'Emprendedor', price: '350', items: ['2 usuarios', 'Facturas ilimitadas', 'Conciliación bancaria', 'Soporte por correo'], featured: true },
  { name: 'Pyme', price: '800', items: ['5 usuarios + contador', 'Nómina e inventario', 'Varias series de factura', 'Soporte prioritario'] },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <h1>La contabilidad de tu negocio, sin complicaciones</h1>
          <p>Hecha para mipymes de Nicaragua: factura, registra gastos, calcula tu cuota fija o tu IVA, lleva tu nómina y ten tus estados financieros listos el día 10. Pensada para quien no es contador.</p>
          <div className="cta">
            <a className="btn primary big" href={`${APP_URL}/registro`}>Crear cuenta gratis</a>
            <Link className="btn big" href="/ayuda/primeros-pasos/">Ver cómo funciona</Link>
          </div>
        </div>
      </section>
      <section className="wrap features">
        {FEATURES.map(([t, d]) => (
          <div className="card" key={t}><h3>{t}</h3><p>{d}</p></div>
        ))}
      </section>
      <section className="wrap">
        <h2 className="center">Planes</h2>
        <p className="center muted">Precios de ejemplo en córdobas, al mes. Ajústalos a tu mercado.</p>
        <div className="plans">
          {PLANS.map((p) => (
            <div className={`card plan${p.featured ? ' featured' : ''}`} key={p.name}>
              <h3>{p.name}</h3>
              <p className="price">C$ {p.price}<span>/mes</span></p>
              <ul>{p.items.map((i) => <li key={i}>{i}</li>)}</ul>
              <a className={`btn${p.featured ? ' primary' : ''}`} href={`${APP_URL}/registro`}>Empezar</a>
            </div>
          ))}
        </div>
      </section>
      <section className="wrap help-band card">
        <div>
          <h2>¿Tienes dudas?</h2>
          <p>Nuestro centro de ayuda tiene guías paso a paso y un glosario en lenguaje sencillo.</p>
        </div>
        <Link className="btn primary" href="/ayuda/">Ir al centro de ayuda</Link>
      </section>
    </>
  );
}
