import { create as createQrMatrix } from 'qrcode/lib/core/qrcode.js';

/**
 * Must match CHECKPOINT_QR_PREFIX on the server. The prefix lets the scanner
 * reject a random product barcode without a network round trip, which matters
 * because scanning happens offline.
 */
export const CHECKPOINT_QR_PREFIX = 'shivapp:cp:';

export const checkpointQrPayload = (token: string) => `${CHECKPOINT_QR_PREFIX}${token}`;

/** Returns the checkpoint token if this is one of our QR codes, else null. */
export const parseCheckpointQr = (payload: string) =>
  payload.startsWith(CHECKPOINT_QR_PREFIX) ? payload.slice(CHECKPOINT_QR_PREFIX.length) : null;

interface QrMatrix {
  modules: { size: number; get: (row: number, column: number) => number };
}

/**
 * Builds a self-contained SVG string for a QR code.
 *
 * Generated from the raw module matrix rather than through a rendering
 * component because these go into print HTML, where there is no React tree to
 * read a ref from and no canvas to export.
 *
 * Error correction is fixed at Q (~25%): these stickers live outdoors on gates
 * and walls, and a scuffed or partly peeled label still has to scan.
 */
export const qrSvgMarkup = (text: string, sizePx: number, quietZone = 2): string => {
  const { modules } = createQrMatrix(text, { errorCorrectionLevel: 'Q' }) as QrMatrix;
  const total = modules.size + quietZone * 2;

  // One path of many subpaths keeps the markup small; a rect per dark module
  // makes a 25x25 code roughly ten times larger for no visual difference.
  let path = '';
  for (let row = 0; row < modules.size; row += 1) {
    for (let column = 0; column < modules.size; column += 1) {
      if (modules.get(row, column)) {
        path += `M${column + quietZone} ${row + quietZone}h1v1h-1z`;
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}"`,
    ` viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">`,
    `<rect width="${total}" height="${total}" fill="#ffffff"/>`,
    `<path d="${path}" fill="#000000"/>`,
    '</svg>',
  ].join('');
};
