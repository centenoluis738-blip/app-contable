import { useState } from 'react';
import { CONTACT_REGIMES, TAX_CODES, type ContactRegime, type TaxCode } from '@contable/shared';
import { api } from '../api';
import { Empty, ErrorBox, Field, Loading, Modal, Money, PageHeader, today, useAction, useFetch } from '../components/ui';

interface Contact { id: string; kind: string; name: string; taxId: string | null; email: string | null; phone: string | null; address: string | null; balance: string; taxRegime: ContactRegime; isState: boolean }
interface Product { id: string; kind: string; name: string; sku: string | null; price: string; taxCode: TaxCode; taxRate: string; trackStock: boolean; stock: string; avgCost: string }

const KIND: Record<string, string> = { customer: 'Cliente', supplier: 'Proveedor', both: 'Ambos', product: 'Producto', service: 'Servicio' };

export function ContactsPage() {
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useFetch(() => api.get<Contact[]>(`/contacts${q ? `?q=${encodeURIComponent(q)}` : ''}`), [q]);
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);
  const action = useAction();
  return (
    <>
      <PageHeader title="Clientes y proveedores" help="contactos" actions={<button className="btn primary" onClick={() => setEditing({ kind: 'customer', taxRegime: 'consumidor_final', isState: false })}>+ Nuevo contacto</button>} />
      <div className="toolbar"><input placeholder="Buscar por nombre o ID fiscal" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data?.length ? <Empty>Agrega tus clientes y proveedores para facturar y registrar compras.</Empty> : (
        <table className="table">
          <thead><tr><th>Nombre</th><th>Tipo</th><th>RUC / cédula</th><th>Régimen</th><th className="num">Saldo</th></tr></thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => setEditing(c)}>
                <td>{c.name}</td><td>{KIND[c.kind]}</td><td>{c.taxId ?? '—'}</td><td>{CONTACT_REGIMES[c.taxRegime]}{c.isState ? ' · Estado' : ''}</td><td className="num"><Money value={c.balance} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <Modal title={editing.id ? 'Editar contacto' : 'Nuevo contacto'} onClose={() => setEditing(null)}>
          <form onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              if (editing.id) await api.put(`/contacts/${editing.id}`, editing); else await api.post('/contacts', editing);
              setEditing(null);
              await reload();
            });
          }}>
            <Field label="Tipo">
              <select value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })}>
                <option value="customer">Cliente</option><option value="supplier">Proveedor</option><option value="both">Cliente y proveedor</option>
              </select>
            </Field>
            <Field label="Nombre o razón social"><input required value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="RUC o cédula"><input value={editing.taxId ?? ''} onChange={(e) => setEditing({ ...editing, taxId: e.target.value })} /></Field>
            <Field label="Régimen fiscal" hint="Si es una empresa del régimen general, te aplicará retención del IR al pagarte.">
              <select value={editing.taxRegime} onChange={(e) => setEditing({ ...editing, taxRegime: e.target.value as ContactRegime })}>
                {Object.entries(CONTACT_REGIMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <label className="check"><input type="checkbox" checked={!!editing.isState} onChange={(e) => setEditing({ ...editing, isState: e.target.checked })} /> Es una institución del Estado</label>
            <Field label="Correo"><input type="email" value={editing.email ?? ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
            <Field label="Teléfono"><input value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
            <Field label="Dirección"><input value={editing.address ?? ''} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></Field>
            <ErrorBox error={action.error} />
            <div className="actions">
              {editing.id && <button type="button" className="btn danger" onClick={() => void action.run(async () => { await api.delete(`/contacts/${editing.id}`); setEditing(null); await reload(); })}>Eliminar</button>}
              <button className="btn primary" disabled={action.busy}>Guardar</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function ProductsPage() {
  const { data, loading, error, reload } = useFetch(() => api.get<Product[]>('/products'));
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [stockIn, setStockIn] = useState<{ product: Product; quantity: string; unitCost: string; date: string; paidWith: string } | null>(null);
  const action = useAction();
  return (
    <>
      <PageHeader title="Productos y servicios" help="productos" actions={<button className="btn primary" onClick={() => setEditing({ kind: 'service', price: '0', taxCode: 'IVA15', trackStock: false })}>+ Nuevo</button>} />
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data?.length ? <Empty>Guarda lo que vendes para facturar más rápido.</Empty> : (
        <table className="table">
          <thead><tr><th>Nombre</th><th>Tipo</th><th>SKU</th><th className="num">Precio</th><th>IVA</th><th className="num">Existencias</th><th className="num">Costo promedio</th><th /></tr></thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.id} className="clickable" onClick={() => setEditing(p)}>
                <td>{p.name}</td><td>{KIND[p.kind]}</td><td>{p.sku ?? '—'}</td><td className="num"><Money value={p.price} /></td>
                <td>{TAX_CODES[p.taxCode].label}</td><td className="num">{p.trackStock ? Number(p.stock) : '—'}</td>
                <td className="num">{p.trackStock ? <Money value={p.avgCost} /> : '—'}</td>
                <td>{p.trackStock && <button className="btn small" onClick={(e) => { e.stopPropagation(); setStockIn({ product: p, quantity: '', unitCost: '', date: today(), paidWith: 'bank' }); }}>+ Entrada</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <Modal title={editing.id ? 'Editar' : 'Nuevo producto o servicio'} onClose={() => setEditing(null)}>
          <form onSubmit={(e) => {
            e.preventDefault();
            const body = { kind: editing.kind, name: editing.name, sku: editing.sku, price: editing.price, taxCode: editing.taxCode, trackStock: editing.trackStock };
            void action.run(async () => {
              if (editing.id) await api.put(`/products/${editing.id}`, body); else await api.post('/products', body);
              setEditing(null);
              await reload();
            });
          }}>
            <Field label="Tipo">
              <select value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })}><option value="service">Servicio</option><option value="product">Producto</option></select>
            </Field>
            <Field label="Nombre"><input required value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="SKU / código"><input value={editing.sku ?? ''} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} /></Field>
            <div className="row">
              <Field label="Precio (sin impuesto)"><input type="number" step="0.01" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} /></Field>
              <Field label="IVA">
                <select value={editing.taxCode} onChange={(e) => setEditing({ ...editing, taxCode: e.target.value as TaxCode })}>
                  {Object.entries(TAX_CODES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
                </select>
              </Field>
            </div>
            {editing.kind === 'product' && (
              <div className="row">
                <label className="check"><input type="checkbox" checked={!!editing.trackStock} onChange={(e) => setEditing({ ...editing, trackStock: e.target.checked })} /> Controlar existencias (costo promedio)</label>
              </div>
            )}
            <ErrorBox error={action.error} />
            <div className="actions">
              {editing.id && <button type="button" className="btn danger" onClick={() => void action.run(async () => { await api.delete(`/products/${editing.id}`); setEditing(null); await reload(); })}>Eliminar</button>}
              <button className="btn primary" disabled={action.busy}>Guardar</button>
            </div>
          </form>
        </Modal>
      )}
      {stockIn && (
        <Modal title={`Entrada de inventario: ${stockIn.product.name}`} onClose={() => setStockIn(null)}>
          <div className="row">
            <Field label="Cantidad"><input type="number" step="any" value={stockIn.quantity} onChange={(e) => setStockIn({ ...stockIn, quantity: e.target.value })} /></Field>
            <Field label="Costo unitario sin IVA (C$)"><input type="number" step="0.01" value={stockIn.unitCost} onChange={(e) => setStockIn({ ...stockIn, unitCost: e.target.value })} /></Field>
          </div>
          <div className="row">
            <Field label="Fecha"><input type="date" value={stockIn.date} onChange={(e) => setStockIn({ ...stockIn, date: e.target.value })} /></Field>
            <Field label="Pagado con">
              <select value={stockIn.paidWith} onChange={(e) => setStockIn({ ...stockIn, paidWith: e.target.value })}>
                <option value="bank">Banco</option><option value="cash">Caja</option><option value="payable">Crédito del proveedor</option>
              </select>
            </Field>
          </div>
          <ErrorBox error={action.error} />
          <button className="btn primary" disabled={action.busy} onClick={() => void action.run(async () => {
            await api.post(`/products/${stockIn.product.id}/stock-in`, { quantity: stockIn.quantity, unitCost: stockIn.unitCost, date: stockIn.date, paidWith: stockIn.paidWith });
            setStockIn(null);
            await reload();
          })}>Registrar entrada</button>
        </Modal>
      )}
    </>
  );
}
