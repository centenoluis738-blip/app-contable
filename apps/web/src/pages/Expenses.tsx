import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { calcLine, splitTaxIncluded, TAX_CODES, type TaxCode } from '@contable/shared';
import { api } from '../api';
import { useSession } from '../session';
import { Badge, Empty, ErrorBox, Field, Loading, Money, PageHeader, today, useAction, useFetch } from '../components/ui';

interface Expense {
  id: string; date: string; description: string; contactName: string | null; accountName: string; subtotal: string; tax: string;
  total: string; status: string; hasReceipt: boolean; currency: string; deductible: boolean;
}
interface Account { id: string; code: string; name: string; type: string; parentId: string | null; isActive: boolean }

export function ExpensesPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const { company } = useSession();
  const { data, loading, error, reload } = useFetch(() => api.get<Expense[]>(`/expenses${status ? `?status=${status}` : ''}`), [status]);
  const action = useAction();
  return (
    <>
      <PageHeader title="Gastos" help="gastos" actions={<Link className="btn primary" to="/gastos/nuevo">+ Nuevo gasto</Link>} />
      <div className="toolbar">
        <select value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}>
          <option value="">Todos</option><option value="unpaid">Pendientes de pago</option><option value="paid">Pagados</option><option value="void">Anulados</option>
        </select>
      </div>
      <ErrorBox error={error ?? action.error} />
      {loading ? <Loading /> : !data?.length ? <Empty>No hay gastos registrados.</Empty> : (
        <table className="table">
          <thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Proveedor</th><th>Estado</th><th className="num">Total</th><th /></tr></thead>
          <tbody>
            {data.map((e) => (
              <tr key={e.id}>
                <td>{e.date}</td>
                <td>{e.description} {e.hasReceipt && <button className="link" onClick={() => void api.open(`/expenses/${e.id}/receipt`)} title="Ver comprobante">📎</button>}</td>
                <td>{e.accountName}{!e.deductible && <span className="badge void"> No deducible</span>}</td>
                <td>{e.contactName ?? '—'}</td>
                <td><Badge status={e.status} /></td>
                <td className="num"><Money value={e.total} currency={e.currency} /></td>
                <td className="actions">
                  {e.status === 'unpaid' && <button className="btn small" onClick={() => void action.run(async () => { await api.post(`/expenses/${e.id}/pay`, { date: today() }); await reload(); })}>Marcar pagado</button>}
                  {e.status !== 'void' && ['owner', 'accountant'].includes(company?.role ?? '') && (
                    <button className="btn small ghost" onClick={() => {
                      const reason = prompt('Motivo de la anulación');
                      if (reason) void action.run(async () => { await api.post(`/expenses/${e.id}/void`, { reason }); await reload(); });
                    }}>Anular</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function ExpenseFormPage() {
  const navigate = useNavigate();
  const accounts = useFetch(() => api.get<Account[]>('/accounts'));
  const suppliers = useFetch(() => api.get<{ id: string; name: string }[]>('/contacts?kind=supplier'));
  const [form, setForm] = useState({
    date: today(), description: '', amount: '', taxIncluded: true, taxCode: 'IVA15' as TaxCode, currency: 'NIO', deductible: true,
    accountId: '', contactId: '', paid: true, paymentMethod: 'card', reference: '',
  });
  const [regime, setRegime] = useState('cuota_fija');
  const [file, setFile] = useState<File | null>(null);
  const { busy, error, run } = useAction();

  useEffect(() => {
    void api.get<{ taxRegime: string }>('/companies/current').then((c) => setRegime(c.taxRegime));
  }, []);

  const categories = (accounts.data ?? []).filter((a) => a.type === 'expense' && a.parentId && a.isActive);
  const taxRate = TAX_CODES[form.taxCode].rate;
  const preview = form.amount
    ? form.taxIncluded ? splitTaxIncluded(form.amount, taxRate) : calcLine({ quantity: 1, unitPrice: form.amount, taxRate })
    : null;

  return (
    <>
      <PageHeader title="Nuevo gasto" help="gastos" />
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const exp = await api.post<{ id: string }>('/expenses', { ...form, contactId: form.contactId || null });
            if (file) {
              const fd = new FormData();
              fd.append('file', file);
              await api.post(`/expenses/${exp.id}/receipt`, fd);
            }
            navigate('/gastos');
          });
        }}
      >
        <div className="row">
          <Field label="Fecha"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Descripción"><input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ej. Papel y tinta" /></Field>
        </div>
        <div className="row">
          <Field label="Categoría">
            <select required value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
              <option value="">Elige…</option>
              {categories.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Proveedor (opcional)">
            <select value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })}>
              <option value="">—</option>
              {suppliers.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="row">
          <Field label="Importe"><input required type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Moneda">
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}><option value="NIO">C$</option><option value="USD">US$</option></select>
          </Field>
          <Field label="IVA">
            <select value={form.taxCode} onChange={(e) => setForm({ ...form, taxCode: e.target.value as TaxCode })}>
              {Object.entries(TAX_CODES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          </Field>
          <label className="check"><input type="checkbox" checked={form.taxIncluded} onChange={(e) => setForm({ ...form, taxIncluded: e.target.checked })} /> El importe ya incluye el impuesto</label>
        </div>
        {preview && (
          <p className="muted">
            Base <Money value={preview.subtotal} currency={form.currency} /> + IVA <Money value={preview.tax} currency={form.currency} /> = <Money value={preview.total} currency={form.currency} strong />
            {regime === 'cuota_fija' && Number(preview.tax) > 0 && ' · En cuota fija el IVA pagado no se acredita: se suma al gasto.'}
          </p>
        )}
        <label className="check">
          <input type="checkbox" checked={!form.deductible} onChange={(e) => setForm({ ...form, deductible: !e.target.checked })} />
          No tiene factura formal o soporte legal (gasto no deducible)
        </label>
        <div className="row">
          <label className="check"><input type="checkbox" checked={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.checked })} /> Ya está pagado</label>
          {form.paid && (
            <Field label="Forma de pago">
              <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                <option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="other">Otro</option>
              </select>
            </Field>
          )}
        </div>
        <Field label="Comprobante (foto o PDF)"><input type="file" accept="image/*,application/pdf,.xml" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        <ErrorBox error={error} />
        <button className="btn primary" disabled={busy}>Guardar gasto</button>
      </form>
    </>
  );
}
