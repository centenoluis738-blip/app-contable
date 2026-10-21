import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { formatMoney } from '@contable/shared';
import { ApiError, HELP_URL } from '../api';
import { useSession } from '../session';

/** Carga datos de la API y expone loading, error y reload. */
export function useFetch<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

/** Ejecuta una acción mostrando el error de la API si falla. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, (e as Error).message));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

export function Money({ value, strong, currency }: { value: string | number | null | undefined; strong?: boolean; currency?: string }) {
  const { company } = useSession();
  const text = formatMoney(value ?? 0, currency ?? company?.currency ?? 'NIO');
  const negative = Number(value) < 0;
  return <span className={`money${negative ? ' neg' : ''}`} style={strong ? { fontWeight: 600 } : undefined}>{text}</span>;
}

export function Alerts({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return <>{items.map((a) => <div className="alert warn" key={a}>{a}</div>)}</>;
}

export function ErrorBox({ error }: { error: ApiError | string | null }) {
  if (!error) return null;
  const message = typeof error === 'string' ? error : error.message;
  const details = typeof error === 'string' ? undefined : error.details;
  return (
    <div className="alert error" role="alert">
      {message}
      {Array.isArray(details) && (
        <ul>{details.map((d, i) => <li key={i}>{d.field ? `${d.field}: ` : ''}{d.message}</li>)}</ul>
      )}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function PageHeader({ title, actions, help }: { title: string; actions?: ReactNode; help?: string }) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      <div className="actions">
        {help && <a className="btn ghost" href={`${HELP_URL}/ayuda/${help}`} target="_blank" rel="noreferrer">? Ayuda</a>}
        {actions}
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Loading() {
  return <p className="muted">Cargando…</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const firstOfMonth = () => today().slice(0, 8) + '01';

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador', issued: 'Emitida', partial: 'Cobro parcial', paid: 'Cobrada', void: 'Anulada', unpaid: 'Pendiente',
};
export function Badge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{STATUS_LABELS[status] ?? status}</span>;
}
