import { fileUrl } from '@/api/client';
import { employeeInitials, employeeName, type Employee } from '@/api/types';
import { formatDate } from '@/lib/format';

/** ISO/IEC 7810 ID-1 (CR80) physical card dimensions. */
export const ID_CARD_WIDTH_MM = 85.6;
export const ID_CARD_HEIGHT_MM = 53.98;

/** Expo Print uses 72 points per inch for explicit PDF page dimensions. */
export const A4_WIDTH_POINTS = (210 / 25.4) * 72;
export const A4_HEIGHT_POINTS = (297 / 25.4) * 72;
export const ID_CARDS_PER_A4_PAGE = 10;

export interface IdCardPrintData {
  employee: Employee;
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  logo?: string;
  signature?: string;
  siteName?: string;
}

const blobAsDataUri = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string'
    ? resolve(reader.result)
    : reject(new Error('The image could not be read'));
  reader.onerror = () => reject(reader.error ?? new Error('The image could not be read'));
  reader.readAsDataURL(blob);
});

const downloadImage = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Image download failed (${response.status})`);
    return await blobAsDataUri(await response.blob());
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Android's HTML-to-PDF WebView can finish the page before remote images decode.
 * Resolve every protected photo/logo/signature first and place the bytes directly
 * in the document, making PDF output deterministic even on a slow connection.
 */
export const embedIdCardImages = async (cards: readonly IdCardPrintData[]) => {
  const sources = cards.flatMap(({ employee, logo, signature }) =>
    [fileUrl(employee.photo), fileUrl(logo), fileUrl(signature)]
      .filter((source): source is string => !!source && /^https?:/i.test(source)),
  );
  const uniqueSources = [...new Set(sources)];
  const embeddedEntries = await Promise.all(
    uniqueSources.map(async (source) => [source, await downloadImage(source)] as const),
  );
  const embedded = new Map(embeddedEntries);
  const resolveSource = (path?: string | null) => {
    const source = fileUrl(path);
    return source ? embedded.get(source) ?? source : undefined;
  };

  return cards.map((card) => ({
    ...card,
    employee: { ...card.employee, photo: resolveSource(card.employee.photo) },
    logo: resolveSource(card.logo),
    signature: resolveSource(card.signature),
  }));
};

const escapeHtml = (value?: string | null) => (value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const cardMarkup = ({
  employee,
  companyName,
  companyAddress,
  companyPhone,
  logo,
  signature,
  siteName,
}: IdCardPrintData) => {
  const row = (label: string, value?: string | null, className = '') => value
    ? `<div class="row ${className}"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`
    : '';
  const logoUrl = fileUrl(logo);
  const photoUrl = fileUrl(employee.photo);
  const signatureUrl = fileUrl(signature);

  return `<article class="card">
${logoUrl ? `<img class="watermark" src="${escapeHtml(logoUrl)}">` : ''}
<div class="header">${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}">` : '<div class="logo-fallback">ID</div>'}<div class="company"><h1>${escapeHtml(companyName)}</h1>${companyAddress ? `<p>${escapeHtml(companyAddress)}</p>` : ''}${companyPhone ? `<p>Ph: ${escapeHtml(companyPhone)}</p>` : ''}</div></div>
<div class="card-body"><div class="details">${row('Name', employeeName(employee).toUpperCase(), 'name')}${row('Rank', employee.designation_name)}${row('ID', employee.employee_code)}${row('Blood Grp', employee.blood_group)}${row('D.O.B', employee.date_of_birth ? formatDate(employee.date_of_birth) : undefined)}${row('Site', siteName)}</div>${photoUrl ? `<img class="photo" src="${escapeHtml(photoUrl)}">` : `<div class="photo-fallback">${escapeHtml(employeeInitials(employee) || 'ID')}</div>`}</div>
<div class="address${signatureUrl ? ' has-signature' : ''}">${row('Address', employee.address)}</div>${signatureUrl ? `<div class="signature"><img src="${escapeHtml(signatureUrl)}"><div class="line"></div><small>Authorized Signatory</small></div>` : ''}
</article>`;
};

const chunksOf = <T,>(items: readonly T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

/**
 * Produces true A4 pages containing a 2 x 5 grid of physical-size CR80 cards.
 * Because the PDF page is already A4, print dialogs no longer enlarge a small
 * card-only page to fill the sheet. The card border is also the cutting line.
 */
export const buildA4IdCardSheetHtml = (cards: readonly IdCardPrintData[]) => {
  if (!cards.length) throw new Error('At least one ID card is required');

  const pages = chunksOf(cards, ID_CARDS_PER_A4_PAGE)
    .map((pageCards) => `<section class="sheet">${pageCards.map(cardMarkup).join('')}</section>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box}
html,body{width:210mm;margin:0;padding:0}
body{font-family:Arial,sans-serif;color:#1e293b;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{width:210mm;height:297mm;padding:7.55mm 15.4mm;display:grid;grid-template-columns:repeat(2,85.6mm);grid-template-rows:repeat(5,53.98mm);column-gap:8mm;row-gap:3mm;overflow:hidden;break-after:page;page-break-after:always}
.sheet:last-child{break-after:auto;page-break-after:auto}
.card{position:relative;width:85.6mm;height:53.98mm;padding:3mm;background:#fff;overflow:hidden;border:.3mm solid #94a3b8;border-radius:3mm;break-inside:avoid;page-break-inside:avoid}
.watermark{position:absolute;inset:7mm 18mm;width:49.6mm;height:39.98mm;object-fit:contain;opacity:.07}
.header{position:relative;display:flex;align-items:center;justify-content:center;min-height:11mm}
.logo,.logo-fallback{width:10mm;height:10mm;border-radius:1.5mm}
.logo{object-fit:contain}
.logo-fallback{display:flex;align-items:center;justify-content:center;background:#eef4ff;color:#2457d6;font-size:4mm;font-weight:700}
.company{max-width:58mm;margin-left:2mm;text-align:center}
.company h1{margin:0;font-size:3.5mm;line-height:4mm;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.company p{margin:.2mm 0 0;color:#64748b;font-size:2mm;line-height:2.5mm}
.card-body{position:relative;display:flex;margin-top:1.5mm}
.details{flex:1;padding-right:2mm}
.row{display:flex;align-items:flex-start;line-height:3.1mm}
.row span{width:17mm;flex:none;color:#94a3b8;font-size:1.8mm;font-weight:700;letter-spacing:.12mm;text-transform:uppercase}
.row b{flex:1;font-size:2.35mm;font-weight:600}
.row.name{margin-bottom:.5mm;line-height:4.5mm}
.row.name b{font-size:3.6mm;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.photo,.photo-fallback{width:15.2mm;height:17.6mm;border-radius:1mm}
.photo{display:block;object-fit:cover}
.photo-fallback{display:flex;align-items:center;justify-content:center;border:.25mm solid #cbd5e1;background:#f1f5f9;color:#94a3b8;font-size:4mm;font-weight:700}
.address{margin-top:.5mm}
.address.has-signature{padding-right:22mm}
.address b{font-size:2mm;line-height:2.7mm}
.signature{position:absolute;right:1.5mm;bottom:2mm;width:22mm;text-align:center}
.signature img{display:block;width:20mm;height:7mm;margin:auto;object-fit:contain}
.signature .line{width:20mm;border-top:.2mm solid #94a3b8;margin:auto}
.signature small{display:block;margin-top:.4mm;color:#64748b;font-size:1.55mm;line-height:2mm;font-weight:700;white-space:nowrap}
</style></head><body>${pages}</body></html>`;
};
