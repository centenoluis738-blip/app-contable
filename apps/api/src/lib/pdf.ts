import PDFDocument from 'pdfkit';
import { formatMoney, INVOICE_STATUS_LABELS, TAX_CODES, WITHHOLDINGS, type InvoiceStatus, type TaxCode, type WithholdingType } from '@contable/shared';

interface PdfInvoice {
  series: string;
  number: number | null;
  issue_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  currency: string;
  subtotal: string;
  tax_total: string;
  total: string;
  amount_paid: string;
  notes: string | null;
  exchange_rate: string;
  withholding_type: WithholdingType;
  withholding_amount: string;
  company: { name: string; tax_id: string | null; address: string | null; email: string | null; phone: string | null; tax_regime: string; invoice_authorization: string | null };
  contact: { name: string; tax_id: string | null; address: string | null; email: string | null };
  lines: { description: string; quantity: string; unit_price: string; discount: string; tax_rate: string; tax_code: TaxCode; subtotal: string }[];
}

/** Genera el PDF de una factura y devuelve su contenido. */
export function invoicePdf(inv: PdfInvoice): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const fmt = (v: string) => formatMoney(v, inv.currency, 'es-NI');
    const number = inv.number ? `${inv.series}-${String(inv.number).padStart(5, '0')}` : 'BORRADOR';

    doc.fontSize(18).text(inv.company.name, { continued: false });
    doc.fontSize(9).fillColor('#555');
    [inv.company.tax_id && `RUC: ${inv.company.tax_id}`, inv.company.address, inv.company.email, inv.company.phone]
      .filter(Boolean)
      .forEach((l) => doc.text(l as string));

    doc.fillColor('#000').fontSize(16).text(`Factura ${number}`, 48, 48, { align: 'right' });
    doc.fontSize(9).text(`Fecha: ${inv.issue_date}`, { align: 'right' });
    if (inv.due_date) doc.text(`Vencimiento: ${inv.due_date}`, { align: 'right' });
    doc.text(`Estado: ${INVOICE_STATUS_LABELS[inv.status]}`, { align: 'right' });
    if (inv.currency !== 'NIO') doc.text(`Moneda: ${inv.currency} · T/C BCN: C$ ${Number(inv.exchange_rate).toFixed(4)}`, { align: 'right' });

    doc.moveDown(4).fontSize(10).text('Cliente', 48).fontSize(11).text(inv.contact.name);
    doc.fontSize(9).fillColor('#555');
    [inv.contact.tax_id && `RUC / cédula: ${inv.contact.tax_id}`, inv.contact.address, inv.contact.email]
      .filter(Boolean)
      .forEach((l) => doc.text(l as string));
    doc.fillColor('#000').moveDown(1.5);

    const cols = [48, 290, 340, 410, 455, 500];
    const header = ['Descripción', 'Cant.', 'Precio', 'Desc.', 'IVA', 'Importe'];
    let y = doc.y;
    doc.fontSize(9).font('Helvetica-Bold');
    header.forEach((h, i) => doc.text(h, cols[i], y, { width: i === 0 ? 235 : 50, align: i === 0 ? 'left' : 'right' }));
    doc.font('Helvetica');
    y += 16;
    doc.moveTo(48, y - 4).lineTo(547, y - 4).strokeColor('#ccc').stroke();
    for (const l of inv.lines) {
      const values = [l.description, Number(l.quantity).toString(), fmt(l.unit_price), `${Number(l.discount)}%`, l.tax_code === 'EXENTO' ? 'Exento' : `${Number(l.tax_rate)}%`, fmt(l.subtotal)];
      const h = doc.heightOfString(l.description, { width: 235 });
      values.forEach((v, i) => doc.text(v, cols[i], y, { width: i === 0 ? 235 : 50, align: i === 0 ? 'left' : 'right' }));
      y += Math.max(h, 12) + 6;
      if (y > 720) {
        doc.addPage();
        y = 48;
      }
    }
    doc.moveTo(48, y).lineTo(547, y).strokeColor('#ccc').stroke();
    y += 10;
    const totals: [string, string][] = [
      ['Subtotal', fmt(inv.subtotal)],
      ['IVA', fmt(inv.tax_total)],
      ['Total', fmt(inv.total)],
    ];
    if (Number(inv.amount_paid) > 0) totals.push(['Pagado', fmt(inv.amount_paid)], ['Pendiente', fmt(String(Number(inv.total) - Number(inv.amount_paid)))]);
    for (const [k, v] of totals) {
      doc.font(k === 'Total' ? 'Helvetica-Bold' : 'Helvetica').text(k, 380, y, { width: 80, align: 'right' }).text(v, 460, y, { width: 87, align: 'right' });
      y += 14;
    }
    const notes = [
      inv.company.tax_regime === 'cuota_fija' && 'Contribuyente del Régimen Simplificado de Cuota Fija: no traslada IVA.',
      Number(inv.withholding_amount) > 0 && `Retención IR esperada (${WITHHOLDINGS[inv.withholding_type].label}): ${fmt(inv.withholding_amount)}. Favor entregar constancia de retención.`,
      inv.lines.some((l) => l.tax_code === 'EXENTO') && 'Las líneas marcadas como "Exento" no causan IVA.',
      inv.lines.some((l) => l.tax_code === 'IVA0') && `${TAX_CODES.IVA0.label}: alícuota 0 %.`,
      inv.notes,
    ].filter(Boolean) as string[];
    doc.font('Helvetica').fontSize(9);
    notes.forEach((n, i) => doc.text(n, 48, (i === 0 ? y + 20 : doc.y + 4), { width: 499 }));
    doc.fontSize(7).fillColor('#888').text(
      inv.company.invoice_authorization
        ? `Autorización DGI: ${inv.company.invoice_authorization}`
        : 'Representación impresa. Use numeración autorizada por la DGI (pie de imprenta) o factura electrónica cuando corresponda.',
      48, 790, { width: 499, align: 'center' },
    );
    doc.end();
  });
}
