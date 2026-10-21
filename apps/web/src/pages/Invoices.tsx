import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { calcDocument, D, expectedWithholding, money, TAX_CODES, WITHHOLDINGS, type ContactRegime, type TaxCode, type WithholdingType } from '@contable/shared';
import { api } from '../api';
import { useSession } from '../session';
import { Alerts, Badge, Empty, ErrorBox, Field, Loading, Modal, Money, PageHeader, today, useAction, useFetch } from '../components/ui';

export interface Invoice {
  id: string; series: string; number: number | null; issueDate: string; dueDate: string | null; status: string; currency: string; exchangeRate: string;
  subtotal: string; taxTotal: string; total: string; amountPaid: string; balance: string; contactId: string; contactName: string;
  notes: string | null; overdue: boolean; withholdingType: WithholdingType; withholdingRate: string; withholdingAmount: string; warnings: string[];
}
interface InvoiceDetail extends Invoice {
  lines: { description: string; quantity: string; unitPrice: string; discount: string; taxCode: TaxCode; taxRate: string; subtotal: string; productId: string | null }[];
  payments: { id: string; date: string; amount: string; withheld: string; method: string; reference: string | null }[];
}
interface Contact { id: string; name: string; kind: string; taxRegime: ContactRegime }
interface Product { id: string; name: string; price: string; taxCode: TaxCode; trackStock: boolean; stock: string }

const METHODS: Record<string, string> = { transfer: 'Transferencia', cash: 'Efectivo', card: 'Tarjeta', check: 'Cheque', other: 'Otro' };

export const invoiceNumber = (i: Pick<Invoice, 'series' | 'number'>) => (i.number ? `${i.series}-${String(i.number).padStart(5, '0')}` : 'Borrador');

export function InvoicesPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [q, setQ] = useState('');
  const { data, loading, error } = useFetch(
    () => api.get<Invoice[]>(`/invoices?${new URLSearchParams({ ...(status && { status }), ...(q && { q }) })}`),
    [status, q],
  );
  return (
    <>
      <PageHeader title="Facturas" help="facturas" actions={<Link className="btn primary" to="/facturas/nueva">+ Nueva factura</Link>} />
      <div className="toolbar">
        <input placeholder="Buscar por cliente o número" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}>
          <option value="">Todas</option>
          <option value="draft">Borradores</option>
          <option value="issued,partial">Pendientes de cobro</option>
          <option value="paid">Cobradas</option>
          <option value="void">Anuladas</option>
        </select>
      </div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data?.length ? (
        <Empty>Aún no hay facturas. <Link to="/facturas/nueva">Crea la primera</Link>.</Empty>
      ) : (
        <table className="table">
          <thead><tr><th>Número</th><th>Cliente</th><th>Fecha</th><th>Vence</th><th>Estado</th><th className="num">Total</th><th className="num">Pendiente</th></tr></thead>
          <tbody>
            {data.map((i) => (
              <tr key={i.id}>
                <td><Link to={`/facturas/${i.id}`}>{invoiceNumber(i)}</Link></td>
                <td>{i.contactName}</td>
                <td>{i.issueDate}</td>
                <td className={i.overdue ? 'danger' : ''}>{i.dueDate ?? '—'}</td>
                <td><Badge status={i.status} /></td>
                <td className="num"><Money value={i.total} currency={i.currency} /></td>
                <td className="num"><Money value={['issued', 'partial'].includes(i.status) ? i.balance : 0} currency={i.currency} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

const emptyLine = () => ({ productId: '', description: '', quantity: '1', unitPrice: '0', discount: '0', taxCode: 'IVA15' as TaxCode });

export function InvoiceFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const contacts = useFetch(() => api.get<Contact[]>('/contacts?kind=customer'));
  const products = useFetch(() => api.get<Product[]>('/products'));
  const [regime, setRegime] = useState<'cuota_fija' | 'general'>('cuota_fija');
  const [form, setForm] = useState({
    contactId: '', issueDate: today(), dueDate: '', notes: '', currency: 'NIO', withholdingType: 'ninguna' as WithholdingType, lines: [emptyLine()],
  });
  const { busy, error, run } = useAction();

  useEffect(() => {
    void api.get<{ taxRegime: 'cuota_fija' | 'general' }>('/companies/current').then((c) => setRegime(c.taxRegime));
    if (id) {
      void api.get<InvoiceDetail>(`/invoices/${id}`).then((inv) =>
        setForm({
          contactId: inv.contactId, issueDate: inv.issueDate, dueDate: inv.dueDate ?? '', notes: inv.notes ?? '', currency: inv.currency,
          withholdingType: inv.withholdingType,
          lines: inv.lines.map((l) => ({ productId: l.productId ?? '', description: l.description, quantity: String(Number(l.quantity)), unitPrice: l.unitPrice, discount: String(Number(l.discount)), taxCode: l.taxCode })),
        }),
      );
    }
  }, [id]);

  const rateOf = (code: TaxCode) => (regime === 'cuota_fija' ? 0 : TAX_CODES[code].rate);
  const totals = calcDocument(form.lines.map((l) => ({ quantity: l.quantity || 0, unitPrice: l.unitPrice || 0, discount: l.discount || 0, taxRate: rateOf(l.taxCode) })));
  const contact = contacts.data?.find((c) => c.id === form.contactId);
  // Vista previa de la retención (en facturas en córdobas; en dólares la calcula el servidor con el tipo de cambio)
  const wht = contact && form.currency === 'NIO' ? expectedWithholding(form.withholdingType, totals.subtotal, contact.taxRegime) : null;
  const setLine = (i: number, patch: Partial<(typeof form.lines)[number]>) =>
    setForm({ ...form, lines: form.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const save = (issue: boolean) =>
    run(async () => {
      const body = { ...form, dueDate: form.dueDate || null, issue, lines: form.lines.map((l) => ({ ...l, productId: l.productId || null, discount: Number(l.discount) })) };
      if (id) {
        await api.put(`/invoices/${id}`, body);
        if (issue) await api.post(`/invoices/${id}/issue`);
        navigate(`/facturas/${id}`);
      } else {
        const inv = await api.post<Invoice>('/invoices', body);
        navigate(`/facturas/${inv.id}`);
      }
    });

  return (
    <>
      <PageHeader title={id ? 'Editar borrador' : 'Nueva factura'} help="facturas" />
      {regime === 'cuota_fija' && <div className="alert warn">Tu empresa está en cuota fija: la factura no lleva IVA.</div>}
      <div className="card">
        <div className="row">
          <Field label="Cliente">
            <select value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })}>
              <option value="">Elige un cliente…</option>
              {contacts.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Fecha"><input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></Field>
          <Field label="Vencimiento"><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
          <Field label="Moneda">
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="NIO">Córdobas (C$)</option><option value="USD">Dólares (US$)</option>
            </select>
          </Field>
        </div>
        {!contacts.data?.length && !contacts.loading && <p className="muted">No tienes clientes. <Link to="/contactos">Agrega uno</Link>.</p>}
        {contact?.taxRegime === 'general' && (
          <Field label="Retención IR que te aplicará el cliente" hint="Los clientes del régimen general retienen IR en la fuente. Esa retención la acreditas a tu cuota fija o anticipo.">
            <select value={form.withholdingType} onChange={(e) => setForm({ ...form, withholdingType: e.target.value as WithholdingType })}>
              {Object.entries(WITHHOLDINGS).map(([k, w]) => <option key={k} value={k}>{w.label}{w.minimum > 1 ? ` (desde C$ ${w.minimum.toLocaleString('es-NI')})` : ''}</option>)}
            </select>
          </Field>
        )}
        <table className="table lines">
          <thead><tr><th>Producto</th><th>Descripción</th><th>Cant.</th><th>Precio</th><th>Desc. %</th><th>IVA</th><th className="num">Importe</th><th /></tr></thead>
          <tbody>
            {form.lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <select value={l.productId} onChange={(e) => {
                    const p = products.data?.find((x) => x.id === e.target.value);
                    setLine(i, p ? { productId: p.id, description: p.name, unitPrice: p.price, taxCode: p.taxCode } : { productId: '' });
                  }}>
                    <option value="">—</option>
                    {products.data?.map((p) => <option key={p.id} value={p.id}>{p.name}{p.trackStock ? ` (${Number(p.stock)})` : ''}</option>)}
                  </select>
                </td>
                <td><input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Qué vendes" /></td>
                <td><input type="number" min="0" step="any" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                <td><input type="number" step="0.01" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></td>
                <td><input type="number" min="0" max="100" value={l.discount} onChange={(e) => setLine(i, { discount: e.target.value })} /></td>
                <td>
                  <select value={l.taxCode} disabled={regime === 'cuota_fija'} onChange={(e) => setLine(i, { taxCode: e.target.value as TaxCode })}>
                    {Object.entries(TAX_CODES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
                  </select>
                </td>
                <td className="num"><Money value={totals.lines[i]?.subtotal} currency={form.currency} /></td>
                <td>{form.lines.length > 1 && <button className="btn ghost" onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })} aria-label="Quitar línea">✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn ghost" onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })}>+ Agregar línea</button>
        <div className="totals">
          <div><span>Subtotal</span><Money value={totals.subtotal} currency={form.currency} /></div>
          {regime === 'general' && <div><span>IVA 15 %</span><Money value={totals.taxTotal} currency={form.currency} /></div>}
          <div className="grand"><span>Total</span><Money value={totals.total} currency={form.currency} strong /></div>
          {wht && Number(wht.amount) > 0 && (
            <>
              <div><span>Retención IR {wht.rate} %</span><Money value={`-${wht.amount}`} /></div>
              <div><span>Recibirás</span><Money value={money(D(totals.total).minus(wht.amount))} strong /></div>
            </>
          )}
        </div>
        <Field label="Notas (aparecen en la factura)"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <ErrorBox error={error} />
        <div className="actions">
          <button className="btn" disabled={busy} onClick={() => void save(false)}>Guardar borrador</button>
          <button className="btn primary" disabled={busy} onClick={() => void save(true)}>Emitir factura</button>
        </div>
      </div>
    </>
  );
}

export function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { company } = useSession();
  const { data: inv, loading, error, reload } = useFetch(() => api.get<InvoiceDetail>(`/invoices/${id}`), [id]);
  const [modal, setModal] = useState<'pay' | 'void' | null>(null);
  const [pay, setPay] = useState({ amount: '', withheld: '0', date: today(), method: 'transfer', reference: '' });
  const [reason, setReason] = useState('');
  const action = useAction();
  const canVoid = company?.role === 'owner' || company?.role === 'accountant';

  if (loading) return <Loading />;
  if (!inv) return <ErrorBox error={error} />;
  const cur = inv.currency;
  return (
    <>
      <PageHeader
        title={`Factura ${invoiceNumber(inv)}`}
        help="facturas"
        actions={
          <>
            <button className="btn" onClick={() => void api.open(`/invoices/${inv.id}/pdf`)}>Ver PDF</button>
            {inv.status === 'draft' && <Link className="btn" to={`/facturas/${inv.id}/editar`}>Editar</Link>}
            {inv.status === 'draft' && <button className="btn primary" onClick={() => void action.run(async () => { await api.post(`/invoices/${inv.id}/issue`); await reload(); })}>Emitir</button>}
            {inv.status === 'draft' && <button className="btn danger" onClick={() => void action.run(async () => { await api.delete(`/invoices/${inv.id}`); navigate('/facturas'); })}>Borrar</button>}
            {['issued', 'partial'].includes(inv.status) && (
              <button className="btn primary" onClick={() => {
                const full = inv.balance === money(D(inv.total).minus(inv.amountPaid));
                setPay({ ...pay, amount: inv.balance, withheld: full && Number(inv.amountPaid) === 0 ? inv.withholdingAmount : '0' });
                setModal('pay');
              }}>Registrar cobro</button>
            )}
            {canVoid && !['draft', 'void'].includes(inv.status) && <button className="btn danger" onClick={() => setModal('void')}>Anular</button>}
          </>
        }
      />
      <Alerts items={inv.warnings} />
      <ErrorBox error={action.error} />
      <div className="card">
        <div className="row spread">
          <div><span className="muted">Cliente</span><h2>{inv.contactName}</h2></div>
          <div><span className="muted">Fecha</span><p>{inv.issueDate}</p></div>
          <div><span className="muted">Vence</span><p className={inv.overdue ? 'danger' : ''}>{inv.dueDate ?? '—'}</p></div>
          <div><span className="muted">Estado</span><p><Badge status={inv.status} /></p></div>
          {cur !== 'NIO' && <div><span className="muted">Tipo de cambio</span><p>C$ {Number(inv.exchangeRate).toFixed(4)}</p></div>}
        </div>
        <table className="table">
          <thead><tr><th>Descripción</th><th className="num">Cant.</th><th className="num">Precio</th><th className="num">Desc.</th><th className="num">IVA</th><th className="num">Importe</th></tr></thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td><td className="num">{Number(l.quantity)}</td><td className="num"><Money value={l.unitPrice} currency={cur} /></td>
                <td className="num">{Number(l.discount)} %</td><td className="num">{l.taxCode === 'EXENTO' ? 'Exento' : `${Number(l.taxRate)} %`}</td>
                <td className="num"><Money value={l.subtotal} currency={cur} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="totals">
          <div><span>Subtotal</span><Money value={inv.subtotal} currency={cur} /></div>
          <div><span>IVA</span><Money value={inv.taxTotal} currency={cur} /></div>
          <div className="grand"><span>Total</span><Money value={inv.total} currency={cur} strong /></div>
          {Number(inv.withholdingAmount) > 0 && <div><span>Retención IR esperada {Number(inv.withholdingRate)} %</span><Money value={inv.withholdingAmount} currency={cur} /></div>}
          {Number(inv.amountPaid) > 0 && <div><span>Cobrado</span><Money value={inv.amountPaid} currency={cur} /></div>}
          {['issued', 'partial'].includes(inv.status) && <div><span>Pendiente</span><Money value={inv.balance} currency={cur} strong /></div>}
        </div>
        {inv.notes && <p className="muted">{inv.notes}</p>}
      </div>
      {inv.payments.length > 0 && (
        <div className="card">
          <h2>Cobros</h2>
          <table className="table">
            <thead><tr><th>Fecha</th><th>Forma de pago</th><th>Referencia</th><th className="num">Retención IR</th><th className="num">Importe</th></tr></thead>
            <tbody>
              {inv.payments.map((p) => (
                <tr key={p.id}><td>{p.date}</td><td>{METHODS[p.method] ?? p.method}</td><td>{p.reference ?? '—'}</td>
                  <td className="num"><Money value={p.withheld} currency={cur} /></td><td className="num"><Money value={p.amount} currency={cur} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal === 'pay' && (
        <Modal title="Registrar cobro" onClose={() => setModal(null)}>
          <Field label={`Importe aplicado a la factura (${cur})`}><input type="number" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
          <Field label="De ese importe, ¿cuánto te retuvieron de IR?" hint="Solo si el cliente te entregó constancia de retención. Lo recibido en banco o caja será el importe menos la retención.">
            <input type="number" step="0.01" value={pay.withheld} onChange={(e) => setPay({ ...pay, withheld: e.target.value })} />
          </Field>
          <p className="muted">Recibes: <Money value={money(D(pay.amount || 0).minus(pay.withheld || 0))} currency={cur} strong /></p>
          <Field label="Fecha"><input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></Field>
          <Field label="Forma de pago">
            <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
              {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Referencia"><input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
          <ErrorBox error={action.error} />
          <button className="btn primary" disabled={action.busy} onClick={() => void action.run(async () => { await api.post(`/invoices/${inv.id}/payments`, pay); setModal(null); await reload(); })}>Guardar cobro</button>
        </Modal>
      )}
      {modal === 'void' && (
        <Modal title="Anular factura" onClose={() => setModal(null)}>
          <p>Se registrará un contraasiento y, si tenía cobros, también se revertirán. Esta acción no se puede deshacer.</p>
          <Field label="Motivo"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <ErrorBox error={action.error} />
          <button className="btn danger" disabled={action.busy} onClick={() => void action.run(async () => { await api.post(`/invoices/${inv.id}/void`, { reason }); setModal(null); await reload(); })}>Anular factura</button>
        </Modal>
      )}
    </>
  );
}
