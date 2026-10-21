'use client';

import { useState, type FormEvent } from 'react';
import { API_URL } from '@/lib/site';

const CATEGORIES = [
  ['cuenta', 'Mi cuenta o acceso'], ['facturacion', 'Facturas y cobros'], ['contabilidad', 'Contabilidad y reportes'],
  ['impuestos', 'Impuestos'], ['bancos', 'Bancos y conciliación'], ['app_movil', 'App móvil'], ['otro', 'Otro'],
];

export function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', category: 'otro', subject: '', message: '', website: '' });
  const [state, setState] = useState<{ status: 'idle' | 'sending' | 'ok' | 'error'; message?: string }>({ status: 'idle' });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState({ status: 'sending' });
    try {
      const res = await fetch(`${API_URL}/support/tickets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details?.[0]?.message ?? data.error ?? 'No se pudo enviar');
      setState({ status: 'ok', message: `Recibimos tu solicitud. Número de ticket: ${data.number}. Te escribiremos a ${form.email}.` });
    } catch (err) {
      setState({ status: 'error', message: (err as Error).message });
    }
  };

  if (state.status === 'ok') return <div className="alert ok">{state.message}</div>;
  return (
    <form className="card form" onSubmit={submit}>
      <label>Nombre<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label>Correo<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
      <label>Tema
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label>Asunto<input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label>
      <label>Mensaje<textarea required minLength={10} rows={6} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></label>
      {/* Campo oculto anti-spam */}
      <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
      {state.status === 'error' && <div className="alert error">{state.message}</div>}
      <button className="btn primary" disabled={state.status === 'sending'}>{state.status === 'sending' ? 'Enviando…' : 'Enviar'}</button>
    </form>
  );
}
