import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session';
import { ErrorBox, Field, useAction } from '../components/ui';

export function LoginPage({ mode }: { mode: 'login' | 'register' }) {
  const { login } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const { busy, error, run } = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await api.post<{ token: string }>(mode === 'login' ? '/auth/login' : '/auth/register', form);
      await login(res.token);
      navigate('/');
    });
  };

  return (
    <div className="auth">
      <form className="card auth-card" onSubmit={submit}>
        <h1>{mode === 'login' ? 'Inicia sesión' : 'Crea tu cuenta'}</h1>
        <p className="muted">{mode === 'login' ? 'Bienvenido de nuevo.' : 'Empieza gratis; no necesitas tarjeta.'}</p>
        {mode === 'register' && (
          <Field label="Nombre"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        )}
        <Field label="Correo"><input type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Contraseña" hint={mode === 'register' ? 'Mínimo 8 caracteres, con letras y números' : undefined}>
          <input type="password" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <ErrorBox error={error} />
        <button className="btn primary" disabled={busy}>{busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
        <p className="muted">
          {mode === 'login' ? <>¿No tienes cuenta? <Link to="/registro">Regístrate</Link></> : <>¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link></>}
        </p>
      </form>
    </div>
  );
}

export function OnboardingPage() {
  const { refresh, selectCompany } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', taxId: '', taxRegime: 'cuota_fija', fixedFee: '', municipality: 'Managua', address: '' });
  const { busy, error, run } = useAction();
  return (
    <div className="auth">
      <form
        className="card auth-card"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const c = await api.post<{ id: string }>('/companies', {
              ...form, country: 'NI', currency: 'NIO', defaultTaxRate: 15, fixedFee: form.fixedFee || '0',
            });
            await refresh();
            selectCompany(c.id);
            navigate('/');
          });
        }}
      >
        <h1>Datos de tu negocio</h1>
        <p className="muted">Con esto preparamos tu catálogo de cuentas (NIIF para PYMES) y tus facturas en córdobas.</p>
        <Field label="Nombre o razón social"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Número RUC"><input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} /></Field>
        <Field label="Régimen ante la DGI" hint="Cuota fija: ingresos menores a C$ 100,000 al mes e inventario menor a C$ 500,000. No cobras IVA en tus facturas.">
          <select value={form.taxRegime} onChange={(e) => setForm({ ...form, taxRegime: e.target.value })}>
            <option value="cuota_fija">Régimen simplificado de cuota fija</option>
            <option value="general">Régimen general (cobro IVA 15 %)</option>
          </select>
        </Field>
        <div className="row">
          {form.taxRegime === 'cuota_fija' && (
            <Field label="Cuota fija mensual (C$)"><input type="number" step="0.01" value={form.fixedFee} onChange={(e) => setForm({ ...form, fixedFee: e.target.value })} /></Field>
          )}
          <Field label="Municipio (para el IMI)"><input value={form.municipality} onChange={(e) => setForm({ ...form, municipality: e.target.value })} /></Field>
        </div>
        <Field label="Dirección"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        <ErrorBox error={error} />
        <button className="btn primary" disabled={busy}>Crear empresa</button>
      </form>
    </div>
  );
}
