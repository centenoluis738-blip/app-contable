import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { HELP_URL } from '../api';
import { useSession } from '../session';

const NAV = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/facturas', label: 'Facturas' },
  { to: '/gastos', label: 'Gastos' },
  { to: '/contactos', label: 'Clientes y proveedores' },
  { to: '/productos', label: 'Productos y servicios' },
  { to: '/bancos', label: 'Bancos' },
  { to: '/impuestos', label: 'Impuestos' },
  { to: '/nomina', label: 'Nómina' },
  { to: '/reportes', label: 'Reportes' },
  { to: '/contabilidad', label: 'Contabilidad' },
  { to: '/configuracion', label: 'Configuración' },
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
          {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
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
