import { fileUrl } from '@/api/client';
import type { Quotation, QuotationCostHead } from '@/api/types';
import { formatDate } from '@/lib/format';
import { formatMoneyMinor } from '@/lib/quotation';

export const A4_WIDTH_POINTS = (210 / 25.4) * 72;
export const A4_HEIGHT_POINTS = (297 / 25.4) * 72;

const escapeHtml = (value?: string | null) => (value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const blobAsDataUri = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string'
    ? resolve(reader.result)
    : reject(new Error('The image could not be read'));
  reader.onerror = () => reject(reader.error ?? new Error('The image could not be read'));
  reader.readAsDataURL(blob);
});

const embedImage = async (path?: string) => {
  const source = fileUrl(path);
  if (!source || !/^https?:/i.test(source)) return source;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(source, { signal: controller.signal });
    if (!response.ok) throw new Error(`Image download failed (${response.status})`);
    return await blobAsDataUri(await response.blob());
  } finally {
    clearTimeout(timeout);
  }
};

/** Embeds protected images because the native PDF WebView cannot send auth headers. */
export const embedQuotationImages = async (quotation: Quotation): Promise<Quotation> => ({
  ...quotation,
  company_snapshot: {
    ...quotation.company_snapshot,
    logo: await embedImage(quotation.company_snapshot.logo),
    signature: await embedImage(quotation.company_snapshot.signature),
  },
});

const rateLabel = (head: QuotationCostHead) => head.kind === 'percentage'
  ? `${(head.rateBps / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}%`
  : '';

export const buildQuotationHtml = (quotation: Quotation) => {
  if (!quotation.services.length) throw new Error('Quotation has no services');
  const { company_snapshot: company } = quotation;
  const logo = fileUrl(company.logo);
  const signature = fileUrl(company.signature);
  const calculationRows = new Map(
    quotation.calculation.rows.map((row) => [row.costHeadId, row.amountsMinor]),
  );
  const serviceColumns = quotation.services.length;
  // The framed A4 layout leaves 180mm for the table. The first three columns
  // consume 62mm, leaving 118mm for services, even on wider quotations.
  const serviceWidth = 118 / serviceColumns;
  let subtotalAdded = false;
  const subtotalAtTax = Object.fromEntries(
    quotation.services.map((service) => {
      let subtotal = service.baseAmountMinor;
      for (const head of quotation.cost_heads) {
        if (head.kind === 'percentage' && head.basis === 'running_subtotal') break;
        const amount = calculationRows.get(head.id)?.[service.id];
        if (typeof amount === 'number') subtotal += amount;
      }
      return [service.id, subtotal];
    }),
  );

  const subtotalRow = () => {
    subtotalAdded = true;
    return `<tr class="subtotal"><td></td><td>Sub Total</td><td></td>${quotation.services
      .map((service) => `<td>${escapeHtml(formatMoneyMinor(subtotalAtTax[service.id]))}</td>`).join('')}</tr>`;
  };

  const costRows = quotation.cost_heads.map((head, index) => {
    const before = head.kind === 'percentage' && head.basis === 'running_subtotal' && !subtotalAdded
      ? subtotalRow()
      : '';
    const amounts = calculationRows.get(head.id) ?? {};
    const cells = quotation.services.map((service) => {
      if (head.kind === 'text') return `<td>${escapeHtml(head.values[service.id] ?? '')}</td>`;
      return `<td>${escapeHtml(formatMoneyMinor(amounts[service.id] ?? 0))}</td>`;
    }).join('');
    return `${before}<tr><td>${index + 2}</td><td>${escapeHtml(head.label)}</td><td>${escapeHtml(rateLabel(head))}</td>${cells}</tr>`;
  }).join('');

  const contactLine = [
    company.address,
    company.gstNumber ? `GSTIN: ${company.gstNumber}` : '',
  ].filter(Boolean).map(escapeHtml).join(' &nbsp; • &nbsp; ');
  const emailLine = company.email ? `Email: ${escapeHtml(company.email)}` : '';
  const phoneLine = company.phone ? `Ph: ${escapeHtml(company.phone)}` : '';
  const clientLines = [
    quotation.client_address,
    quotation.client_contact_name ? `Attn: ${quotation.client_contact_name}` : '',
    quotation.client_phone,
    quotation.client_email,
    quotation.client_gst_number ? `GSTIN: ${quotation.client_gst_number}` : '',
  ].filter(Boolean).map(escapeHtml).join('<br>');
  const columnFont = serviceColumns > 4 ? 7 : serviceColumns > 3 ? 8 : 9;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:A4 portrait;margin:16mm 14mm 18mm}
*{box-sizing:border-box} html,body{margin:0;padding:0}
body{padding:0 1mm;font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:9pt;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page-border{position:fixed;inset:-9mm -7mm -11mm;border:.35mm solid #6b7280;box-shadow:inset 0 0 0 .7mm #fff,inset 0 0 0 .9mm #d1d5db;pointer-events:none;z-index:10}
.watermark{position:fixed;left:50%;top:calc(50% + 1mm);width:132mm;height:132mm;transform:translate(-50%,-50%);object-fit:contain;opacity:.12;z-index:-1}
header{text-align:center;border-bottom:.5mm solid #1f2937;padding:0 6mm 2.5mm;margin-bottom:5mm}
.logo{display:block;width:16mm;height:16mm;object-fit:contain;margin:0 auto 1mm}
h1{margin:0;font-size:18pt;line-height:1.08;letter-spacing:.15pt;color:#111827}.tagline{font-size:8pt;font-weight:700;margin-top:.8mm;color:#374151}.contact{font-size:7pt;margin-top:.8mm;color:#4b5563}.email,.phone{font-size:7.5pt;font-weight:700;margin-top:.6mm;color:#1f2937;text-align:center}
.meta{display:flex;align-items:stretch;justify-content:space-between;gap:6mm;margin-bottom:4mm}.client,.quote-meta{border:.25mm solid #d1d5db;border-radius:1.5mm;background:rgba(255,255,255,.86);padding:3mm}.client{flex:1}.quote-meta{width:59mm}.label{color:#6b7280;font-size:7pt;text-transform:uppercase;font-weight:700;letter-spacing:.5pt}.value{font-size:10pt;font-weight:700;margin:1mm 0}.meta-row{display:flex;align-items:flex-start;justify-content:space-between;gap:3mm;border-bottom:.2mm solid #e5e7eb;padding:1.2mm 0}.meta-row:first-child{padding-top:0}.meta-row:last-child{border-bottom:0;padding-bottom:0}.meta-row strong{text-align:right}
h2{text-align:center;font-size:13pt;margin:3mm 0 4mm;padding:0 5mm;color:#1f2937}
.rates{width:100%;border-collapse:collapse;table-layout:fixed;font-size:${columnFont}pt;background:rgba(255,255,255,.8);break-inside:auto;page-break-inside:auto;break-after:avoid-page;page-break-after:avoid}
.rates thead{display:table-header-group}.rates tbody{display:table-row-group}.rates tr{break-inside:avoid-page;page-break-inside:avoid}.rates thead tr{break-after:avoid-page;page-break-after:avoid}.rates th,.rates td{border:.25mm solid #374151;padding:2mm 1.5mm;vertical-align:top;word-break:break-word}
.rates .letterhead-cell,.rates .quotation-info-cell{border:0;padding:0;background:transparent;text-align:initial;font-weight:400}
.rates th{background:#e5e7eb;text-align:left;font-weight:800;vertical-align:middle}.rates .column-head th:nth-child(1),.rates tbody td:nth-child(1){width:8mm;text-align:center}.rates .column-head th:nth-child(2),.rates tbody td:nth-child(2){width:39mm}.rates .column-head th:nth-child(3),.rates tbody td:nth-child(3){width:15mm;text-align:center}
${quotation.services.map((_, index) => `.rates .column-head th:nth-child(${index + 4}),.rates tbody td:nth-child(${index + 4}){width:${serviceWidth}mm;text-align:right}.rates .column-head th:nth-child(${index + 4}){text-align:center}`).join('')}
.subtotal td,.total td{font-weight:800}.subtotal td{background:rgba(243,244,246,.8)}.total td{background:#e5e7eb;font-size:${columnFont + 1}pt}
.closing{display:flex;align-items:flex-end;justify-content:flex-end;gap:8mm;margin-top:6mm;break-inside:avoid-page;page-break-inside:avoid;break-before:avoid-page;page-break-before:avoid}
.terms{flex:1;min-width:0;margin:0;border:.25mm solid #d1d5db;border-radius:1.5mm;background:rgba(255,255,255,.86);padding:3mm;white-space:pre-wrap;font-size:8pt;line-height:1.4}.terms strong{display:block;margin-bottom:1mm;font-size:8.5pt;color:#1f2937}
.signature{flex:0 0 54mm;margin:0;text-align:center;break-inside:avoid-page;page-break-inside:avoid}.signature img{display:block;width:38mm;height:14mm;object-fit:contain;margin:auto}.signature .line{border-top:.3mm solid #374151;margin-top:1mm;padding-top:1.5mm;font-weight:700}
.footer{position:fixed;bottom:-6mm;left:0;right:0;text-align:center;color:#6b7280;font-size:7pt;line-height:1.2;letter-spacing:.15pt}
</style></head><body>
<div class="page-border"></div>
${logo ? `<img class="watermark" src="${escapeHtml(logo)}">` : ''}
<table class="rates"><thead>
<tr class="letterhead-row"><th class="letterhead-cell" colspan="${serviceColumns + 3}"><header>${logo ? `<img class="logo" src="${escapeHtml(logo)}">` : ''}<h1>${escapeHtml(company.name)}</h1>${company.tagline ? `<div class="tagline">${escapeHtml(company.tagline)}</div>` : ''}${contactLine ? `<div class="contact">${contactLine}</div>` : ''}${emailLine ? `<div class="email">${emailLine}</div>` : ''}${phoneLine ? `<div class="phone">${phoneLine}</div>` : ''}</header></th></tr>
<tr class="quotation-info-row"><th class="quotation-info-cell" colspan="${serviceColumns + 3}"><section class="meta"><div class="client"><div class="label">Quotation for</div><div class="value">${escapeHtml(quotation.client_name)}</div>${clientLines ? `<div>${clientLines}</div>` : ''}</div><div class="quote-meta"><div class="meta-row"><span>Quotation No.</span><strong>${escapeHtml(quotation.quotation_number)}</strong></div><div class="meta-row"><span>Date</span><strong>${escapeHtml(formatDate(quotation.quotation_date))}</strong></div>${quotation.valid_until ? `<div class="meta-row"><span>Valid until</span><strong>${escapeHtml(formatDate(quotation.valid_until))}</strong></div>` : ''}</div></section><h2>${escapeHtml(quotation.title)}</h2></th></tr>
<tr class="column-head"><th>S.no.</th><th>Cost Head</th><th>in %</th>${quotation.services.map((service) => `<th>${escapeHtml(service.label)}</th>`).join('')}</tr>
</thead><tbody>
<tr><td>1</td><td><strong>Base rate / minimum wages</strong></td><td>—</td>${quotation.services.map((service) => `<td>${escapeHtml(formatMoneyMinor(service.baseAmountMinor))}</td>`).join('')}</tr>
${costRows}
<tr class="total"><td></td><td>Total</td><td></td>${quotation.services.map((service) => `<td>${escapeHtml(formatMoneyMinor(quotation.calculation.totalsMinor[service.id] ?? 0))}</td>`).join('')}</tr>
</tbody></table>
<section class="closing">${quotation.terms ? `<section class="terms"><strong>Terms & notes</strong>${escapeHtml(quotation.terms)}</section>` : ''}<section class="signature">${signature ? `<img src="${escapeHtml(signature)}">` : '<div style="height:14mm"></div>'}<div class="line">Authorized Signatory</div><div>${escapeHtml(company.name)}</div></section></section>
<div class="footer">${escapeHtml(quotation.quotation_number)} · Generated from the approved quotation record</div>
</body></html>`;
};
