import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session';
import { Alerts, Loading, Money, PageHeader, useFetch, ErrorBox } from '../components/ui';

interface Dashboard {
  month: string; income: string; expenses: string; result: string; cash: string; receivable: string; payable: string;
  overdueInvoices: number; pendingBankTransactions: number; alerts: string[]; regime: string; series: { month: string; income: string; expenses: string }[];
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function Chart({ series }: { series: Dashboard['series'] }) {
  const max = Math.max(1, ...series.flatMap((s) => [Number(s.income), Number(s.expenses)]));
  return (
    <div className="chart" role="img" aria-label="Ingresos y gastos de los últimos 6 meses">
      {series.map((s) => (
        <div className="chart-col" key={s.month}>
          <div className="bars">
            <div className="bar income" style={{ height: `${(Number(s.income) / max) * 100}%` }} title={`Ingresos ${s.income}`} />
            <div className="bar expense" style={{ height: `${(Number(s.expenses) / max) * 100}%` }} title={`Gastos ${s.expenses}`} />
          </div>
          <span>{MONTHS[Number(s.month.slice(5)) - 1]}</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { company } = useSession();
  const { data, error, loading } = useFetch(() => api.get<Dashboard>('/reports/dashboard'), [company?.id]);
  return (
    <>
      <PageHeader
        title={`Hola, ${company?.name ?? ''}`}
        help="primeros-pasos"
        actions={<><Link className="btn" to="/gastos/nuevo">+ Gasto</Link><Link className="btn" to="/facturas/nueva">+ Factura</Link><Link className="btn primary" to="/venta">+ Venta rápida</Link></>}
      />
      <ErrorBox error={error} />
      {loading || !data ? <Loading /> : (
        <>
          <Alerts items={data.alerts} />
          <div className="kpis">
            <div className="kpi"><span>Ingresos del mes</span><Money value={data.income} strong /></div>
            <div className="kpi"><span>Gastos del mes</span><Money value={data.expenses} strong /></div>
            <div className="kpi"><span>Resultado del mes</span><Money value={data.result} strong /></div>
            <div className="kpi"><span>Caja y bancos</span><Money value={data.cash} strong /></div>
          </div>
          <div className="grid2">
            <div className="card">
              <h2>Últimos 6 meses</h2>
              <Chart series={data.series} />
              <div className="legend"><span className="dot income" /> Ingresos <span className="dot expense" /> Gastos</div>
            </div>
            <div className="card">
              <h2>Pendientes</h2>
              <ul className="todo">
                <li><Link to="/facturas?status=issued,partial">Por cobrar</Link><Money value={data.receivable} /></li>
                <li><Link to="/gastos?status=unpaid">Por pagar</Link><Money value={data.payable} /></li>
                <li><Link to="/facturas?status=issued,partial">Facturas vencidas</Link><strong>{data.overdueInvoices}</strong></li>
                <li><Link to="/bancos">Movimientos sin conciliar</Link><strong>{data.pendingBankTransactions}</strong></li>
                <li><Link to="/impuestos">Impuestos del mes</Link><span className="muted">{data.regime === 'cuota_fija' ? 'Cuota fija' : 'Régimen general'}</span></li>
              </ul>
            </div>
          </div>
        </>
      )}
    </>
  );
}
