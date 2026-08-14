import type { PatrolCheckpoint } from '@/api/types';
import { checkpointQrPayload, qrSvgMarkup } from '@/lib/qr';

/** Expo Print uses 72 points per inch for explicit PDF page dimensions. */
export const A4_WIDTH_POINTS = (210 / 25.4) * 72;
export const A4_HEIGHT_POINTS = (297 / 25.4) * 72;

/** 3 columns x 4 rows on A4, sized so a sticker survives being cut out by hand. */
export const STICKERS_PER_A4_PAGE = 12;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!
  ));

export interface CheckpointSticker {
  checkpoint: PatrolCheckpoint;
  routeName: string;
  siteName: string;
}

/**
 * A printable sheet of checkpoint QR stickers.
 *
 * The QR is inlined as SVG markup rather than a remote image so the PDF is
 * deterministic: Android's HTML-to-PDF WebView will happily finish the page
 * before a network image decodes, which would silently print blank squares.
 */
export const buildCheckpointQrSheetHtml = (stickers: readonly CheckpointSticker[]) => {
  const cells = stickers
    .map(({ checkpoint, routeName, siteName }) => `
      <div class="sticker">
        <div class="qr">${qrSvgMarkup(checkpointQrPayload(checkpoint.qr_token ?? ''), 150)}</div>
        <div class="seq">${checkpoint.sequence}</div>
        <div class="name">${escapeHtml(checkpoint.checkpoint_name)}</div>
        <div class="meta">${escapeHtml(routeName)}</div>
        <div class="meta">${escapeHtml(siteName)}</div>
      </div>`)
    .join('');

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: -apple-system, "Helvetica Neue", Roboto, Arial, sans-serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .sheet {
        display: flex;
        flex-wrap: wrap;
        align-content: flex-start;
        width: 210mm;
        padding: 6mm 4mm;
      }
      .sticker {
        width: 67.3mm;
        height: 68mm;
        padding: 4mm 3mm;
        border: 0.4mm dashed #b8c2cf;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        page-break-inside: avoid;
        position: relative;
      }
      .qr { width: 40mm; height: 40mm; }
      .qr svg { width: 100%; height: 100%; display: block; }
      .seq {
        position: absolute;
        top: 3mm;
        left: 3mm;
        width: 7mm;
        height: 7mm;
        border-radius: 50%;
        background: #102a43;
        color: #ffffff;
        font-size: 9pt;
        font-weight: 700;
        line-height: 7mm;
      }
      .name {
        margin-top: 2.5mm;
        font-size: 11pt;
        font-weight: 700;
        color: #102a43;
        line-height: 1.15;
        word-break: break-word;
      }
      .meta { margin-top: 1mm; font-size: 8pt; color: #5b6b7f; line-height: 1.2; }
    </style>
  </head>
  <body><div class="sheet">${cells}</div></body>
</html>`;
};
