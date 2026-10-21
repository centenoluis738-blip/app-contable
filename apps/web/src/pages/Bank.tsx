import { useState } from 'react';
import { api } from '../api';
import { Empty, ErrorBox, Loading, Modal, Money, PageHeader, useAction, useFetch } from '../components/ui';

interface Tx {
  id: string; date: string; description: string; amount: string; reference: string | null; matchedType: string | null;
  suggestions: { type: 'invoice' | 'expense'; id: string; label: string }[];
}
interface Account { id: string; code: string; name: string; type: string; parentId: string | null; systemKey: string | null }

export function BankPage() {
  const [status, setStatus] = useState('pending');
  const { data, loading, error, reload } = useFetch(() => api.get<Tx[]>(`/bank/transactions?status=${status}`), [status]);
  const accounts = useFetch(() => api.get<Account[]>('/accounts'));
  const action = useAction();
  const [result, setResult] = useState<string | null>(null);
  const [categorize, setCategorize] = useState<Tx | null>(null);
  const [accountId, setAccountId] = useState('');

  const upload = (file: File) =>
    action.run(async () => {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post<{ imported: number; skipped: number }>('/bank/import', fd);
      setResult(`Importados ${r.imported} movimientos${r.skipped ? `; ${r.skipped} ya existían` : ''}.`);
      await reload();
    });
  const match = (t: Tx, type: string, id: string) =>
    action.run(async () => { await api.post(`/bank/transactions/${t.id}/match`, { type, id }); await reload(); });

  return (
    <>
      <PageHeader
        title="Bancos"
        help="conciliacion-bancaria"
        actions={
          <label className="btn primary">
            Importar extracto (CSV)
            <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
          </label>
        }
      />
      <p className="muted">El archivo debe tener columnas de fecha, concepto e importe (o cargo y abono). Los ingresos van en positivo y los pagos en negativo.</p>
      {result && <div className="alert ok">{result}</div>}
      <ErrorBox error={error ?? action.error} />
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Sin conciliar</option><option value="matched">Conciliados</option><option value="all">Todos</option>
        </select>
      </div>
      {loading ? <Loading /> : !data?.length ? <Empty>No hay movimientos {status === 'pending' ? 'pendientes' : ''}.</Empty> : (
        <table className="table">
          <thead><tr><th>Fecha</th><th>Concepto</th><th className="num">Importe</th><th>Conciliación</th></tr></thead>
          <tbody>
            {data.map((t) => (
              <tr key={t.id}>
                <td>{t.date}</td>
                <td>{t.description}</td>
                <td className="num"><Money value={t.amount} /></td>
                <td className="actions">
                  {t.matchedType ? <span className="badge paid">Conciliado</span> : (
                    <>
                      {t.suggestions.map((s) => <button key={s.id} className="btn small primary" onClick={() => void match(t, s.type, s.id)}>✓ {s.label}</button>)}
                      <button className="btn small" onClick={() => { setCategorize(t); setAccountId(''); }}>Asignar cuenta</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {categorize && (
        <Modal title="Asignar a una cuenta" onClose={() => setCategorize(null)}>
          <p>{categorize.description} · <Money value={categorize.amount} /></p>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Elige la cuenta…</option>
            {(accounts.data ?? []).filter((a) => a.parentId && a.systemKey !== 'bank').map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </select>
          <ErrorBox error={action.error} />
          <button className="btn primary" disabled={!accountId || action.busy} onClick={() => void match(categorize, 'account', accountId).then((ok) => ok && setCategorize(null))}>Conciliar</button>
        </Modal>
      )}
    </>
  );
}
