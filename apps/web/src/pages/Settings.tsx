import { useEffect, useState } from 'react';
import { ROLE_LABELS, TAX_REGIMES, type Role, type TaxRegime } from '@contable/shared';
import { api } from '../api';
import { useSession } from '../session';
import { ErrorBox, Field, PageHeader, today, useAction, useFetch } from '../components/ui';

interface Company { name: string; taxId: string | null; taxRegime: TaxRegime; fixedFee: string; imiRate: string; pmdRate: string; municipality: string | null; invoiceAuthorization: string | null; address: string | null; email: string | null; phone: string | null; invoiceSeries: string; lockedUntil: string | null; currency: string }
interface Rate { currency: string; date: string; rate: string }
interface Member { id: string; name: string; email: string; role: Role }

export function SettingsPage() {
  const { company: current, user, refresh } = useSession();
  const isOwner = current?.role === 'owner';
  const [form, setForm] = useState<Company | null>(null);
  const members = useFetch(() => api.get<Member[]>('/companies/current/members'));
  const [invite, setInvite] = useState({ email: '', role: 'employee' as Role });
  const [lockDate, setLockDate] = useState('');
  const save = useAction();
  const team = useAction();
  const lock = useAction();
  const rates = useFetch(() => api.get<Rate[]>('/companies/current/exchange-rates'));
  const [newRate, setNewRate] = useState({ currency: 'USD', date: today(), rate: '' });
  const fx = useAction();
  const [saved, setSaved] = useState(false);

  useEffect(() => { void api.get<Company>('/companies/current').then(setForm); }, [current?.id]);
  if (!form) return null;

  return (
    <>
      <PageHeader title="Configuración" help="configuracion" />
      <div className="card">
        <h2>Datos de la empresa</h2>
        <div className="row">
          <Field label="Razón social"><input disabled={!isOwner} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="RUC"><input disabled={!isOwner} value={form.taxId ?? ''} onChange={(e) => setForm({ ...form, taxId: e.target.value })} /></Field>
          <Field label="Régimen fiscal (DGI)">
            <select disabled={!isOwner} value={form.taxRegime} onChange={(e) => setForm({ ...form, taxRegime: e.target.value as TaxRegime })}>
              {Object.entries(TAX_REGIMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <div className="row">
          {form.taxRegime === 'cuota_fija'
            ? <Field label="Cuota fija mensual (C$)" hint="El monto que te asignó la DGI"><input disabled={!isOwner} type="number" step="0.01" value={form.fixedFee} onChange={(e) => setForm({ ...form, fixedFee: e.target.value })} /></Field>
            : <Field label="Pago mínimo definitivo / anticipo IR %"><input disabled={!isOwner} type="number" step="0.01" value={form.pmdRate} onChange={(e) => setForm({ ...form, pmdRate: e.target.value })} /></Field>}
          <Field label="Municipio"><input disabled={!isOwner} value={form.municipality ?? ''} onChange={(e) => setForm({ ...form, municipality: e.target.value })} /></Field>
          <Field label="IMI %" hint="Impuesto municipal sobre ingresos"><input disabled={!isOwner} type="number" step="0.01" value={form.imiRate} onChange={(e) => setForm({ ...form, imiRate: e.target.value })} /></Field>
        </div>
        <div className="row">
          <Field label="Dirección"><input disabled={!isOwner} value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Correo"><input disabled={!isOwner} value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Teléfono"><input disabled={!isOwner} value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        </div>
        <div className="row">
          <Field label="Serie de facturas"><input disabled={!isOwner} value={form.invoiceSeries} onChange={(e) => setForm({ ...form, invoiceSeries: e.target.value })} /></Field>
          <Field label="Autorización de facturación DGI" hint="Se imprime al pie de la factura"><input disabled={!isOwner} value={form.invoiceAuthorization ?? ''} onChange={(e) => setForm({ ...form, invoiceAuthorization: e.target.value })} /></Field>
        </div>
        <ErrorBox error={save.error} />
        {saved && <div className="alert ok">Cambios guardados.</div>}
        {isOwner && (
          <button className="btn primary" disabled={save.busy} onClick={() => void save.run(async () => {
            const { name, taxId, taxRegime, address, email, phone, invoiceSeries, fixedFee, imiRate, pmdRate, municipality, invoiceAuthorization } = form;
            await api.patch('/companies/current', {
              name, taxId, taxRegime, address, email: email || undefined, phone, invoiceSeries,
              fixedFee: Number(fixedFee), imiRate: Number(imiRate), pmdRate: Number(pmdRate), municipality, invoiceAuthorization,
            });
            setSaved(true);
            await refresh();
          })}>Guardar cambios</button>
        )}
      </div>

      <div className="card">
        <h2>Tipo de cambio</h2>
        <p className="muted">Registra el tipo de cambio oficial del BCN para cada día que factures o pagues en dólares. Los documentos en USD se contabilizan en córdobas con el tipo de cambio de su fecha y la diferencia al cobrar o pagar va a diferencial cambiario.</p>
        <div className="row">
          <Field label="Moneda"><input value={newRate.currency} onChange={(e) => setNewRate({ ...newRate, currency: e.target.value.toUpperCase() })} /></Field>
          <Field label="Fecha"><input type="date" value={newRate.date} onChange={(e) => setNewRate({ ...newRate, date: e.target.value })} /></Field>
          <Field label="C$ por unidad"><input type="number" step="0.0001" value={newRate.rate} onChange={(e) => setNewRate({ ...newRate, rate: e.target.value })} /></Field>
          <button className="btn" disabled={fx.busy || !newRate.rate} onClick={() => void fx.run(async () => {
            await api.post('/companies/current/exchange-rates', { ...newRate, rate: Number(newRate.rate) });
            setNewRate({ ...newRate, rate: '' });
            await rates.reload();
          })}>Guardar</button>
        </div>
        <ErrorBox error={fx.error} />
        {!!rates.data?.length && (
          <table className="table compact">
            <thead><tr><th>Fecha</th><th>Moneda</th><th className="num">Tipo de cambio</th></tr></thead>
            <tbody>{rates.data.slice(0, 15).map((r) => <tr key={r.currency + r.date}><td>{r.date}</td><td>{r.currency}</td><td className="num">{Number(r.rate).toFixed(4)}</td></tr>)}</tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Equipo</h2>
        <table className="table">
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th /></tr></thead>
          <tbody>
            {members.data?.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td><td>{m.email}</td><td>{ROLE_LABELS[m.role]}</td>
                <td>{isOwner && m.id !== user?.id && <button className="btn small ghost" onClick={() => void team.run(async () => { await api.delete(`/companies/current/members/${m.id}`); await members.reload(); })}>Quitar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {isOwner && (
          <div className="row">
            <Field label="Correo de la persona (ya registrada)"><input value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></Field>
            <Field label="Rol">
              <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <button className="btn" onClick={() => void team.run(async () => { await api.post('/companies/current/members', invite); setInvite({ ...invite, email: '' }); await members.reload(); })}>Agregar</button>
          </div>
        )}
        <ErrorBox error={team.error} />
      </div>

      {(isOwner || current?.role === 'accountant') && (
        <div className="card">
          <h2>Cierre de período</h2>
          <p className="muted">
            {form.lockedUntil ? `Período cerrado hasta el ${form.lockedUntil}.` : 'No hay períodos cerrados.'} Después de cerrar no se pueden registrar operaciones con fecha igual o anterior.
          </p>
          <div className="row">
            <Field label="Cerrar hasta"><input type="date" value={lockDate} onChange={(e) => setLockDate(e.target.value)} /></Field>
            <button className="btn danger" disabled={!lockDate} onClick={() => {
              if (confirm(`¿Cerrar el período hasta ${lockDate}? No se podrá deshacer desde la app.`)) {
                void lock.run(async () => { const r = await api.post<{ lockedUntil: string }>('/companies/current/close-period', { until: lockDate }); setForm({ ...form, lockedUntil: r.lockedUntil }); });
              }
            }}>Cerrar período</button>
          </div>
          <ErrorBox error={lock.error} />
        </div>
      )}
    </>
  );
}
