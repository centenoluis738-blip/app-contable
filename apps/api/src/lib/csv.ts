import type { Response } from 'express';

/** Envía filas como CSV (separado por punto y coma, con BOM para que Excel lo abra con acentos). */
export function sendCsv(res: Response, filename: string, rows: Record<string, unknown>[]) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [headers.join(';'), ...rows.map((r) => headers.map((h) => esc(r[h])).join(';'))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + body);
}
