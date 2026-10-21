import { useState } from 'react';
import { api } from '../api';
import { Empty, ErrorBox, Field, Loading, Modal, Money, PageHeader, today, useAction, useFetch } from '../components/ui';

interface Employee { id?: string; name: string; idNumber: string | null; inssNumber: string | null; position: string | null; monthlySalary: string; startDate: string; active: boolean }
type Amounts = { gross: string; inssEmployee: string; ir: string; net: string; inssEmployer: string; inatec: string; aguinaldo: string; vacaciones: string; indemnizacion: string };
interface Preview { employees: number; inssEmployerRate: number; lines: ({ employee: Employee } & Amounts)[]; totals: Amounts }
interface Run { id: string; month: string; date: string; employees: number; totals: Amounts }

const COLUMNS: [keyof Amounts, string][] = [
  ['gross', 'Salario'], ['inssEmployee', 'INSS laboral 7 %'], ['ir', 'IR'], ['net', 'Neto a pagar'],
  ['inssEmployer', 'INSS patronal'], ['inatec', 'INATEC 2 %'], ['aguinaldo', 'Aguinaldo'], ['vacaciones', 'Vacaciones'], ['indemnizacion', 'Indemnización'],
];

const blank = (): Employee => ({ name: '', idNumber: '', inssNumber: '', position: '', monthlySalary: '', startDate: today(), active: true });

export function PayrollPage() {
  const employees = useFetch(() => api.get<Employee[]>('/payroll/employees'));
  const preview = useFetch(() => api.get<Preview>('/payroll/preview').catch(() => null));
  const runs = useFetch(() => api.get<Run[]>('/payroll/runs'));
  const [editing, setEditing] = useState<Employee | null>(null);
  const [month, setMonth] = useState(today().slice(0, 7));
  const action = useAction();
  const reloadAll = async () => { await employees.reload(); await preview.reload(); await runs.reload(); };

  return (
    <>
      <PageHeader title="Nómina" help="nomina" actions={<button className="btn primary" onClick={() => setEditing(blank())}>+ Trabajador</button>} />
      <ErrorBox error={employees.error ?? action.error} />
      <div className="card">
        <h2>Trabajadores</h2>
        {employees.loading ? <Loading /> : !employees.data?.length ? <Empty>Agrega a tus trabajadores para calcular la nómina.</Empty> : (
          <table className="table">
            <thead><tr><th>Nombre</th><th>Cargo</th><th>Cédula</th><th>N.º INSS</th><th className="num">Salario mensual</th><th>Estado</th></tr></thead>
            <tbody>
              {employees.data.map((e) => (
                <tr key={e.id} className="clickable" onClick={() => setEditing({ ...e })}>
                  <td>{e.name}</td><td>{e.position}</td><td>{e.idNumber}</td><td>{e.inssNumber}</td>
                  <td className="num"><Money value={e.monthlySalary} /></td><td>{e.active ? 'Activo' : 'Inactivo'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {preview.data && (
        <div className="card">
          <h2>Nómina del mes</h2>
          <p className="muted">
            {preview.data.employees} trabajadores activos. INSS patronal {preview.data.inssEmployerRate} % (22.5 % desde 50 trabajadores). Aguinaldo, vacaciones e indemnización se provisionan al 8.33 % cada uno.
          </p>
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Trabajador</th>{COLUMNS.map(([k, l]) => <th className="num" key={k}>{l}</th>)}</tr></thead>
              <tbody>
                {preview.data.lines.map((l) => (
                  <tr key={l.employee.id}><td>{l.employee.name}</td>{COLUMNS.map(([k]) => <td className="num" key={k}><Money value={l[k]} /></td>)}</tr>
                ))}
                <tr className="total"><td>Total</td>{COLUMNS.map(([k]) => <td className="num" key={k}><Money value={preview.data!.totals[k]} strong /></td>)}</tr>
              </tbody>
            </table>
          </div>
          <div className="row">
            <Field label="Mes a registrar"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
            <button className="btn primary" disabled={action.busy} onClick={() => {
              if (confirm(`¿Registrar la nómina de ${month}? Se creará el asiento con sueldos, INSS, INATEC, IR y provisiones.`)) {
                void action.run(async () => { await api.post('/payroll/runs', { month }); await runs.reload(); });
              }
            }}>Registrar nómina</button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Nóminas registradas</h2>
        {!runs.data?.length ? <Empty>Aún no has registrado nóminas.</Empty> : (
          <table className="table">
            <thead><tr><th>Mes</th><th>Fecha</th><th className="num">Trabajadores</th><th className="num">Salarios</th><th className="num">Neto pagado</th><th className="num">INSS + INATEC patronal</th></tr></thead>
            <tbody>
              {runs.data.map((r) => (
                <tr key={r.id}>
                  <td>{r.month}</td><td>{r.date}</td><td className="num">{r.employees}</td>
                  <td className="num"><Money value={r.totals.gross} /></td><td className="num"><Money value={r.totals.net} /></td>
                  <td className="num"><Money value={Number(r.totals.inssEmployer) + Number(r.totals.inatec)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <Modal title={editing.id ? 'Editar trabajador' : 'Nuevo trabajador'} onClose={() => setEditing(null)}>
          <div className="row">
            <Field label="Nombre completo"><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Cargo"><input value={editing.position ?? ''} onChange={(e) => setEditing({ ...editing, position: e.target.value })} /></Field>
          </div>
          <div className="row">
            <Field label="Cédula"><input value={editing.idNumber ?? ''} onChange={(e) => setEditing({ ...editing, idNumber: e.target.value })} /></Field>
            <Field label="N.º de asegurado INSS"><input value={editing.inssNumber ?? ''} onChange={(e) => setEditing({ ...editing, inssNumber: e.target.value })} /></Field>
          </div>
          <div className="row">
            <Field label="Salario mensual (C$)"><input type="number" step="0.01" value={editing.monthlySalary} onChange={(e) => setEditing({ ...editing, monthlySalary: e.target.value })} /></Field>
            <Field label="Fecha de ingreso"><input type="date" value={editing.startDate} onChange={(e) => setEditing({ ...editing, startDate: e.target.value })} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Activo</label>
          <ErrorBox error={action.error} />
          <div className="modal-actions">
            <button className="btn primary" disabled={action.busy} onClick={() => void action.run(async () => {
              const { id, ...body } = editing;
              const payload = { ...body, monthlySalary: Number(body.monthlySalary) };
              if (id) await api.put(`/payroll/employees/${id}`, payload);
              else await api.post('/payroll/employees', payload);
              setEditing(null);
              await reloadAll();
            })}>Guardar</button>
          </div>
        </Modal>
      )}
    </>
  );
}
