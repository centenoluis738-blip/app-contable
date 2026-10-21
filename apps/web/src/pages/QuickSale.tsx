import { useState } from 'react';
import { D, money, sum } from '@contable/shared';
import { api } from '../api';
import { useSession } from '../session';
import { Empty, ErrorBox, Loading, Money, PageHeader, today, useAction, useFetch } from '../components/ui';

interface Product { id: string; kind: string; name: string; price: string; trackStock: boolean; stock: string }
interface Item { productId: string | null; description: string; quantity: number; unitPrice: string }

const METHODS = [['cash', 'Efectivo'], ['card', 'Tarjeta'], ['transfer', 'Transferencia']] as const;

/** Venta de mostrador pensada para el teléfono: tocar piezas, cobrar y listo. */
export function QuickSalePage() {
  const { company } = useSession();
  const products = useFetch(() => api.get<Product[]>('/products'));
  const [items, setItems] = useState<Item[]>([]);
  const [currency, setCurrency] = useState(company?.currency ?? 'NIO');
  const [method, setMethod] = useState<(typeof METHODS)[number][0]>('cash');
  const [other, setOther] = useState({ description: '', price: '' });
  const [done, setDone] = useState<string | null>(null);
  const sale = useAction();
  // Los precios del inventario están en córdobas; en dólares se convierten con el último tipo de cambio BCN registrado
  const rates = useFetch(() => api.get<{ currency: string; date: string; rate: string }[]>('/companies/current/exchange-rates'));
  const usd = rates.data?.find((r) => r.currency === 'USD');
  const toCurrency = (nio: string | number, cur = currency) => (cur === 'USD' && usd ? money(D(nio).dividedBy(usd.rate)) : money(nio));
  const switchCurrency = (cur: string) => {
    if (cur === currency || !usd) return;
    setItems((list) => list.map((i) => ({
      ...i, unitPrice: cur === 'USD' ? money(D(i.unitPrice || 0).dividedBy(usd.rate)) : money(D(i.unitPrice || 0).times(usd.rate)),
    })));
    setCurrency(cur);
  };

  const add = (p: Product) => {
    setDone(null);
    setItems((list) => {
      const found = list.find((i) => i.productId === p.id);
      if (found) return list.map((i) => (i === found ? { ...i, quantity: i.quantity + 1 } : i));
      return [...list, { productId: p.id, description: p.name, quantity: 1, unitPrice: toCurrency(p.price) }];
    });
  };
  const update = (idx: number, patch: Partial<Item>) =>
    setItems((list) => list.map((i, n) => (n === idx ? { ...i, ...patch } : i)).filter((i) => i.quantity > 0));
  const total = sum(items.map((i) => D(i.unitPrice || 0).times(i.quantity)));
  const stockOf = (id: string | null) => products.data?.find((p) => p.id === id);

  const charge = () => void sale.run(async () => {
    const r = await api.post<{ series: string; number: number; total: string }>('/invoices/quick-sale', {
      date: today(), currency, method, items: items.map((i) => ({ ...i, unitPrice: i.unitPrice })),
    });
    setDone(`Venta ${r.series}-${String(r.number).padStart(5, '0')} registrada por ${currency === 'USD' ? 'US$' : 'C$'} ${Number(r.total).toLocaleString('es-NI', { minimumFractionDigits: 2 })}`);
    setItems([]);
    await products.reload();
  });

  return (
    <>
      <PageHeader title="Venta rápida" help="venta-rapida" />
      {done && <div className="alert ok">{done}</div>}
      <ErrorBox error={sale.error ?? products.error} />
      <div className="quick">
        <section>
          <h2>Toca las piezas que vendes</h2>
          {products.loading ? <Loading /> : !products.data?.length ? <Empty>Agrega tus productos en Inventario para venderlos con un toque.</Empty> : (
            <div className="tiles">
              {products.data.map((p) => {
                const out = p.trackStock && Number(p.stock) <= 0;
                return (
                  <button key={p.id} className="tile" disabled={out} onClick={() => add(p)}>
                    <strong>{p.name}</strong>
                    <span><Money value={p.price} currency="NIO" /></span>
                    {p.trackStock && <small>{out ? 'Agotado' : `Quedan ${Number(p.stock)}`}</small>}
                  </button>
                );
              })}
            </div>
          )}
          <div className="row other">
            <input placeholder="Otra pieza (descripción)" value={other.description} onChange={(e) => setOther({ ...other, description: e.target.value })} />
            <input type="number" inputMode="decimal" placeholder="Precio" value={other.price} onChange={(e) => setOther({ ...other, price: e.target.value })} />
            <button className="btn" disabled={!other.description || !Number(other.price)} onClick={() => {
              setItems([...items, { productId: null, description: other.description, quantity: 1, unitPrice: other.price }]);
              setOther({ description: '', price: '' });
            }}>Agregar</button>
          </div>
        </section>

        <section className="card ticket">
          <h2>Venta</h2>
          {!items.length ? <p className="muted">Aún no hay piezas en esta venta.</p> : (
            <ul className="ticket-lines">
              {items.map((i, n) => {
                const p = stockOf(i.productId);
                const max = p?.trackStock ? Number(p.stock) : Infinity;
                return (
                  <li key={n}>
                    <div className="line-info"><strong>{i.description}</strong>
                      <input aria-label="Precio" type="number" inputMode="decimal" value={i.unitPrice} onChange={(e) => update(n, { unitPrice: e.target.value })} />
                    </div>
                    <div className="qty">
                      <button className="btn small" onClick={() => update(n, { quantity: i.quantity - 1 })} aria-label="Quitar uno">−</button>
                      <span>{i.quantity}</span>
                      <button className="btn small" disabled={i.quantity >= max} onClick={() => update(n, { quantity: i.quantity + 1 })} aria-label="Agregar uno">+</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="segmented" role="group" aria-label="Moneda">
            {['NIO', 'USD'].map((c) => <button key={c} disabled={c === 'USD' && !usd} className={currency === c ? 'active' : ''} onClick={() => switchCurrency(c)}>{c === 'NIO' ? 'Córdobas' : 'Dólares'}</button>)}
          </div>
          <div className="segmented" role="group" aria-label="Forma de pago">
            {METHODS.map(([k, l]) => <button key={k} className={method === k ? 'active' : ''} onClick={() => setMethod(k)}>{l}</button>)}
          </div>
          {usd ? currency === 'USD' && <p className="muted">Precios convertidos a T/C {Number(usd.rate).toFixed(4)} ({usd.date}). Puedes ajustarlos.</p>
  : <p className="muted">Para cobrar en dólares, registra el tipo de cambio BCN en Configuración.</p>}
          <div className="ticket-total"><span>Total</span><Money value={money(total)} currency={currency} strong /></div>
          <button className="btn primary big block" disabled={!items.length || sale.busy || total.lte(0)} onClick={charge}>
            {sale.busy ? 'Registrando…' : 'Cobrar'}
          </button>
        </section>
      </div>
      {items.length > 0 && (
        <div className="mobile-bar">
          <span>{items.reduce((n, i) => n + i.quantity, 0)} piezas · <Money value={money(total)} currency={currency} strong /></span>
          <button className="btn primary" onClick={() => document.querySelector('.ticket')?.scrollIntoView({ behavior: 'smooth' })}>Ver y cobrar</button>
        </div>
      )}
    </>
  );
}
