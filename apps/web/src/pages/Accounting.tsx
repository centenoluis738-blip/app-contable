import { useState } from 'react';
import { ACCOUNT_TYPE_LABELS, D, money, sum, type AccountType } from '@contable/shared';
import { api } from '../api';
import { useSession } from '../session';
import { ErrorBox, Field, Loading, Modal, Money, PageHeader, today, useAction, useFetch } from '../components/ui';

interface Account { id: string; code: string; name: string; type: AccountType; parentId: string | null; systemKey: string | null; isActive: boolean; balance: string }
interface Entry {
  id: string; number: number; date: string; description: string; sourceType: string; reversesId: string | null; reversedBy: string | null;
  lines: { code: string; name: string; debit: string; credit: string }[];
}
interface Ledger { account: { code: string; name: string }; openingBalance: string; moves: { entryId: string; number: number; date: string; description: string; debit: string; credit: string; balance: string }[] }

const SOURCE: Record<string, string> = { manual: 'Manual', invoice: 'Factura', payment: 'Cobro', expense: 'Gasto', expense_payment: 'Pago', bank: 'Banco', payroll: 'Nómina', tax_settlement: 'Impuestos', inventory: 'Inventario', stock_in: 'Inventario' };

export function AccountingPage() {
  const { company } = useSession();
  const canEdit = company?.role === 'owner' || company?.role === 'accountant';
  const [tab, setTab] = useState<'accounts' | 'journal'>('accounts');
  const accounts = useFetch(() => api.get<Account[]>('/accounts'));
  const journal = useFetch(() => api.get<Entry[]>('/journal?limit=100'), [tab]);
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const ledger = useFetch(() => (ledgerId ? api.get<Ledger>(`/journal/ledger/${ledgerId}`) : Promise.resolve(null)), [ledgerId]);
  const [newAccount, setNewAccount] = useState<{ code: string; name: string; type: AccountType; parentId: string } | null>(null);
  const [entry, setEntry] = useState<{ date: string; description: string; lines: { accountId: string; debit: string; credit: string }[] } | null>(null);
  const action = useAction();
  const [from, setFrom] = useState(`${today().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today());

  const leafAccounts = (accounts.data ?? []).filter((a) => a.parentId && a.isActive);
  const entryDebit = entry ? sum(entry.lines.map((l) => l.debit || 0)) : D(0);
  const entryCredit = entry ? sum(entry.lines.map((l) => l.credit || 0)) : D(0);

  return (
    <>
      <PageHeader
        title="Contabilidad"
        help="contabilidad"
        actions={canEdit && (
          <>
            <button className="btn" onClick={() => setNewAccount({ code: '', name: '', type: 'expense', parentId: '' })}>+ Cuenta</button>
            <button className="btn primary" onClick={() => setEntry({ date: today(), description: '', lines: [{ accountId: '', debit: '', credit: '' }, { accountId: '', debit: '', credit: '' }] })}>+ Asiento manual</button>
          </>
        )}
      />
      <div className="tabs">
        <button className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}>Plan de cuentas</button>
        <button className={tab === 'journal' ? 'active' : ''} onClick={() => setTab('journal')}>Libro diario</button>
      </div>
      {tab === 'journal' && (
        <div className="toolbar">
          <Field label="Desde"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Hasta"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <button className="btn" onClick={() => void api.open(`/journal?from=${from}&to=${to}&format=csv`)}>Exportar libro diario (CSV)</button>
        </div>
      )}
      <ErrorBox error={accounts.error ?? journal.error ?? action.error} />
      {tab === 'accounts' && (accounts.loading ? <Loading /> : (
        <table className="table">
          <thead><tr><th>Código</th><th>Cuenta</th><th>Tipo</th><th className="num">Saldo</th></tr></thead>
          <tbody>
            {accounts.data?.map((a) => (
              <tr key={a.id} className={`${a.parentId ? 'clickable' : 'section'}${a.isActive ? '' : ' inactive'}`} onClick={() => a.parentId && setLedgerId(a.id)}>
                <td style={{ paddingLeft: `${(a.code.split('.').length - 1) * 16 + 8}px` }}>{a.code}</td>
                <td>{a.name}</td><td>{ACCOUNT_TYPE_LABELS[a.type]}</td><td className="num"><Money value={a.balance} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      {tab === 'journal' && (journal.loading ? <Loading /> : (
        <div className="journal">
          {journal.data?.map((e) => (
            <div className="card entry" key={e.id}>
              <div className="entry-head">
                <strong>#{e.number}</strong> <span>{e.date}</span> <span>{e.description}</span>
                <span className="badge">{SOURCE[e.sourceType] ?? e.sourceType}</span>
                {e.reversedBy && <span className="badge void">Revertido</span>}
                {canEdit && e.sourceType === 'manual' && !e.reversedBy && !e.reversesId && (
                  <button className="btn small ghost" onClick={() => {
                    const reason = prompt('Motivo de la reversión');
                    if (reason) void action.run(async () => { await api.post(`/journal/${e.id}/reverse`, { reason }); await journal.reload(); await accounts.reload(); });
                  }}>Revertir</button>
                )}
              </div>
              <table className="table compact">
                <tbody>
                  {e.lines.map((l, i) => (
                    <tr key={i}><td className={Number(l.credit) > 0 ? 'indent' : ''}>{l.code} {l.name}</td><td className="num">{Number(l.debit) > 0 && <Money value={l.debit} />}</td><td className="num">{Number(l.credit) > 0 && <Money value={l.credit} />}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}

      {ledgerId && ledger.data && (
        <Modal title={`Mayor: ${ledger.data.account.code} ${ledger.data.account.name}`} onClose={() => setLedgerId(null)}>
          <table className="table compact">
            <thead><tr><th>Fecha</th><th>Asiento</th><th>Concepto</th><th className="num">Debe</th><th className="num">Haber</th><th className="num">Saldo</th></tr></thead>
            <tbody>
              {ledger.data.moves.map((m, i) => (
                <tr key={i}><td>{m.date}</td><td>#{m.number}</td><td>{m.description}</td><td className="num"><Money value={m.debit} /></td><td className="num"><Money value={m.credit} /></td><td className="num"><Money value={m.balance} /></td></tr>
              ))}
            </tbody>
          </table>
          {!ledger.data.moves.length && <p className="muted">Sin movimientos.</p>}
          <button className="btn" onClick={() => void api.open(`/journal/ledger/${ledgerId}?format=csv`)}>Exportar libro mayor (CSV)</button>
        </Modal>
      )}

      {newAccount && (
        <Modal title="Nueva cuenta" onClose={() => setNewAccount(null)}>
          <Field label="Cuenta padre">
            <select value={newAccount.parentId} onChange={(e) => {
              const p = accounts.data?.find((a) => a.id === e.target.value);
              setNewAccount({ ...newAccount, parentId: e.target.value, type: p?.type ?? newAccount.type });
            }}>
              <option value="">Elige…</option>
              {accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
          </Field>
          <Field label="Código" hint="Por ejemplo 5.12"><input value={newAccount.code} onChange={(e) => setNewAccount({ ...newAccount, code: e.target.value })} /></Field>
          <Field label="Nombre"><input value={newAccount.name} onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })} /></Field>
          <ErrorBox error={action.error} />
          <button className="btn primary" onClick={() => void action.run(async () => {
            await api.post('/accounts', { ...newAccount, parentId: newAccount.parentId || null });
            setNewAccount(null);
            await accounts.reload();
          })}>Crear cuenta</button>
        </Modal>
      )}

      {entry && (
        <Modal title="Asiento manual" onClose={() => setEntry(null)}>
          <div className="row">
            <Field label="Fecha"><input type="date" value={entry.date} onChange={(e) => setEntry({ ...entry, date: e.target.value })} /></Field>
            <Field label="Concepto"><input value={entry.description} onChange={(e) => setEntry({ ...entry, description: e.target.value })} /></Field>
          </div>
          <table className="table compact">
            <thead><tr><th>Cuenta</th><th>Debe</th><th>Haber</th></tr></thead>
            <tbody>
              {entry.lines.map((l, i) => {
                const set = (p: Partial<typeof l>) => setEntry({ ...entry, lines: entry.lines.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                return (
                  <tr key={i}>
                    <td><select value={l.accountId} onChange={(e) => set({ accountId: e.target.value })}><option value="">—</option>{leafAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></td>
                    <td><input type="number" step="0.01" value={l.debit} onChange={(e) => set({ debit: e.target.value, credit: '' })} /></td>
                    <td><input type="number" step="0.01" value={l.credit} onChange={(e) => set({ credit: e.target.value, debit: '' })} /></td>
                  </tr>
                );
              })}
              <tr className="total"><td>Totales</td><td><Money value={money(entryDebit)} /></td><td><Money value={money(entryCredit)} /></td></tr>
            </tbody>
          </table>
          <button className="btn ghost" onClick={() => setEntry({ ...entry, lines: [...entry.lines, { accountId: '', debit: '', credit: '' }] })}>+ Línea</button>
          {!entryDebit.equals(entryCredit) && <p className="danger">El debe y el haber deben ser iguales.</p>}
          <ErrorBox error={action.error} />
          <button className="btn primary" disabled={action.busy || !entryDebit.equals(entryCredit)} onClick={() => void action.run(async () => {
            await api.post('/journal', { ...entry, lines: entry.lines.filter((l) => l.accountId).map((l) => ({ accountId: l.accountId, debit: l.debit || '0', credit: l.credit || '0' })) });
            setEntry(null);
            await accounts.reload();
            await journal.reload();
          })}>Registrar asiento</button>
        </Modal>
      )}
    </>
  );
}
