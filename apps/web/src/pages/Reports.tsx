import { useState } from 'react';
import { api } from '../api';
import { TAX_CODES } from '@contable/shared';
import { Alerts, ErrorBox, Field, Loading, Money, PageHeader, today, useAction, useFetch } from '../components/ui';
import { useSession } from '../session';

interface Row { code: string; name: string; amount: string }
interface IncomeStatement { income: Row[]; expenses: Row[]; totalIncome: string; totalExpenses: string; netIncome: string }
interface BalanceSheet { assets: Row[]; liabilities: Row[]; equity: Row[]; totalAssets: string; totalLiabilities: string; totalEquity: string; balanced: boolean }
interface CashFlow { opening: string; closing: string; netChange: string; sections: { section: string; items: { label: string; amount: string }[]; total: string }[] }
interface ByCode { code: string; base: string; tax: string; documents: string }
interface TaxSummary {
  regime: 'cuota_fija' | 'general'; grossIncome: string; withholdingsReceived: string; withholdingsAvailable: string;
  cuotaFija: { fee: string; withholdingsApplied: string; net: string; carryForward: string } | null;
  iva: { output: string; input: string; net: string; result: string } | null;
  pmd: { rate: string; gross: string; withholdingsApplied: string; net: string } | null;
  imi: string; items: { concept: string; authority: string; amount: string; detail: string }[];
  total: string; alerts: string[]; note: string; settled: boolean;
  salesByRate: ByCode[]; purchasesByRate: ByCode[];
}

function Section({ title, rows, total }: { title: string; rows: Row[]; total: string }) {
  return (
    <>
      <tr className="section"><td colSpan={2}>{title}</td></tr>
      {rows.map((r) => <tr key={r.code + r.name}><td>{r.code} {r.name}</td><td className="num"><Money value={r.amount} /></td></tr>)}
      <tr className="total"><td>Total {title.toLowerCase()}</td><td className="num"><Money value={total} strong /></td></tr>
    </>
  );
}

export function ReportsPage() {
  const [tab, setTab] = useState<'pl' | 'bs' | 'cf'>('pl');
  const [from, setFrom] = useState(`${today().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today());
  const pl = useFetch(() => api.get<IncomeStatement>(`/reports/income-statement?from=${from}&to=${to}`), [from, to]);
  const bs = useFetch(() => api.get<BalanceSheet>(`/reports/balance-sheet?date=${to}`), [to]);
  const cf = useFetch(() => api.get<CashFlow>(`/reports/cash-flow?from=${from}&to=${to}`), [from, to]);
  const exportCsv = () =>
    void api.open(
      tab === 'pl' ? `/reports/income-statement?from=${from}&to=${to}&format=csv`
        : tab === 'cf' ? `/reports/cash-flow?from=${from}&to=${to}&format=csv`
          : `/reports/balance-sheet?date=${to}&format=csv`,
    );
  return (
    <>
      <PageHeader title="Reportes" help="reportes" actions={<button className="btn" onClick={exportCsv}>Exportar a Excel (CSV)</button>} />
      <div className="tabs">
        <button className={tab === 'pl' ? 'active' : ''} onClick={() => setTab('pl')}>Estado de resultados</button>
        <button className={tab === 'bs' ? 'active' : ''} onClick={() => setTab('bs')}>Balance general</button>
        <button className={tab === 'cf' ? 'active' : ''} onClick={() => setTab('cf')}>Flujo de efectivo</button>
      </div>
      <div className="toolbar">
        {tab !== 'bs' && <Field label="Desde"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>}
        <Field label={tab !== 'bs' ? 'Hasta' : 'A la fecha'}><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <p className="muted">Estados financieros según NIIF para las PYMES. Prepara el estado de resultados y el flujo de efectivo del mes anterior a más tardar el día 10.</p>
      {tab === 'pl' && (pl.loading || !pl.data ? <><ErrorBox error={pl.error} /><Loading /></> : (
        <table className="table report">
          <tbody>
            <Section title="Ingresos" rows={pl.data.income} total={pl.data.totalIncome} />
            <Section title="Costos y gastos" rows={pl.data.expenses} total={pl.data.totalExpenses} />
            <tr className="grand"><td>Utilidad (pérdida) neta</td><td className="num"><Money value={pl.data.netIncome} strong /></td></tr>
          </tbody>
        </table>
      ))}
      {tab === 'bs' && (bs.loading || !bs.data ? <><ErrorBox error={bs.error} /><Loading /></> : (
        <>
          {!bs.data.balanced && <div className="alert error">El balance no cuadra; revisa los asientos.</div>}
          <table className="table report">
            <tbody>
              <Section title="Activo" rows={bs.data.assets} total={bs.data.totalAssets} />
              <Section title="Pasivo" rows={bs.data.liabilities} total={bs.data.totalLiabilities} />
              <Section title="Patrimonio" rows={bs.data.equity} total={bs.data.totalEquity} />
            </tbody>
          </table>
        </>
      ))}
      {tab === 'cf' && (cf.loading || !cf.data ? <><ErrorBox error={cf.error} /><Loading /></> : (
        <table className="table report">
          <tbody>
            <tr className="total"><td>Efectivo al inicio</td><td className="num"><Money value={cf.data.opening} strong /></td></tr>
            {cf.data.sections.map((s) => (
              <Section key={s.section} title={`Actividades de ${s.section === 'operacion' ? 'operación' : s.section === 'inversion' ? 'inversión' : 'financiamiento'}`}
                rows={s.items.map((i) => ({ code: '', name: i.label, amount: i.amount }))} total={s.total} />
            ))}
            <tr className="total"><td>Aumento (disminución) neto del efectivo</td><td className="num"><Money value={cf.data.netChange} strong /></td></tr>
            <tr className="grand"><td>Efectivo al final</td><td className="num"><Money value={cf.data.closing} strong /></td></tr>
          </tbody>
        </table>
      ))}
    </>
  );
}

const currentMonth = () => today().slice(0, 7);
const codeLabel = (code: string) => TAX_CODES[code as keyof typeof TAX_CODES]?.label ?? code;

export function TaxesPage() {
  const { company } = useSession();
  const canSettle = company?.role === 'owner' || company?.role === 'accountant';
  const [month, setMonth] = useState(currentMonth());
  const { data, loading, error, reload } = useFetch(() => api.get<TaxSummary>(`/taxes/summary?month=${month}`), [month]);
  const settle = useAction();
  return (
    <>
      <PageHeader title="Impuestos" help="impuestos" />
      <div className="toolbar">
        <Field label="Mes"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
      </div>
      <ErrorBox error={error ?? settle.error} />
      {loading || !data ? <Loading /> : (
        <>
          <Alerts items={data.alerts} />
          <div className="kpis">
            <div className="kpi"><span>Ingresos brutos del mes</span><Money value={data.grossIncome} strong /></div>
            {data.cuotaFija && <div className="kpi"><span>Cuota fija asignada</span><Money value={data.cuotaFija.fee} strong /></div>}
            {data.iva && <div className="kpi"><span>IVA (débito − crédito)</span><Money value={data.iva.net} strong /></div>}
            <div className="kpi"><span>Retenciones IR que te hicieron</span><Money value={data.withholdingsReceived} strong /></div>
            <div className="kpi warn"><span>Total a pagar</span><Money value={data.total} strong /></div>
          </div>
          <div className="card">
            <h2>{data.regime === 'cuota_fija' ? 'Régimen de cuota fija' : 'Régimen general'}: qué pagar y a quién</h2>
            <table className="table">
              <thead><tr><th>Concepto</th><th>Institución</th><th>Cálculo</th><th className="num">Monto</th></tr></thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.concept}><td>{i.concept}</td><td>{i.authority}</td><td className="muted">{i.detail}</td><td className="num"><Money value={i.amount} /></td></tr>
                ))}
                <tr className="total"><td colSpan={3}>Total</td><td className="num"><Money value={data.total} strong /></td></tr>
              </tbody>
            </table>
            {data.cuotaFija && Number(data.cuotaFija.carryForward) > 0 && (
              <p className="muted">Te quedan <Money value={data.cuotaFija.carryForward} /> de retenciones para acreditar en los próximos meses (Art. 259 LCT).</p>
            )}
            {data.settled ? <div className="alert ok">Los impuestos de {month} ya están liquidados en la contabilidad.</div> : canSettle && (
              <button className="btn primary" disabled={settle.busy} onClick={() => {
                if (confirm(`¿Registrar la liquidación de impuestos de ${month}? Se creará el asiento contable.`)) {
                  void settle.run(async () => { await api.post('/taxes/settle', { month }); await reload(); });
                }
              }}>Liquidar impuestos del mes</button>
            )}
          </div>
          <div className="grid2">
            {([['Ventas por tipo de impuesto', data.salesByRate], ['Compras por tipo de impuesto', data.purchasesByRate]] as const).map(([title, rows]) => (
              <div className="card" key={title}>
                <h2>{title}</h2>
                <table className="table">
                  <thead><tr><th>Tipo</th><th className="num">Documentos</th><th className="num">Base</th><th className="num">IVA</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.code}><td>{codeLabel(r.code)}</td><td className="num">{r.documents}</td><td className="num"><Money value={r.base} /></td><td className="num"><Money value={r.tax} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <p className="muted">{data.note}</p>
        </>
      )}
    </>
  );
}
