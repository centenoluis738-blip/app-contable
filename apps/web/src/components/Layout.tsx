import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { HELP_URL } from '../api';
import { useSession } from '../session';

// simple: true = se muestra también en el modo sencillo (tramos y negocios pequeños)
const NAV = [
  { to: '/', label: 'Inicio', end: true, simple: true },
  { to: '/venta', label: 'Venta rápida', simple: true },
  { to: '/facturas', label: 'Facturas', simple: true },
  { to: '/gastos', label: 'Gastos', simple: true },
  { to: '/contactos', label: 'Clientes y proveedores' },
  { to: '/productos', label: 'Productos y servicios', simpleLabel: 'Inventario', simple: true },
  { to: '/bancos', label: 'Bancos' },
  { to: '/impuestos', label: 'Impuestos', simple: true },
  { to: '/nomina', label: 'Nómina' },
  { to: '/reportes', label: 'Reportes', simple: true },
  { to: '/contabilidad', label: 'Contabilidad' },
  { to: '/configuracion', label: 'Configuración', simple: true },
];

export function Layout() {
  const { user, companies, company, selectCompany, logout } = useSession();
  const navigate = useNavigate();
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">App Contable</div>
        {companies.length > 1 ? (
          <select value={company?.id} onChange={(e) => { selectCompany(e.target.value); navigate('/'); }} aria-label="Empresa">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : (
          <div className="company-name">{company?.name}</div>
        )}
        <nav>
          {NAV.filter((n) => !company?.simpleMode || n.simple).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>{company?.simpleMode && n.simpleLabel ? n.simpleLabel : n.label}</NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <a href={HELP_URL} target="_blank" rel="noreferrer">Centro de ayuda</a>
          <span className="muted">{user?.name}</span>
          <button className="btn ghost" onClick={() => { logout(); navigate('/login'); }}>Cerrar sesión</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
