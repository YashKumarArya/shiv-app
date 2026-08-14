/**
 * The `qrcode` package ships no types for its internal core module, and the
 * public entry point is not usable here: it renders to a canvas or a file,
 * neither of which exists in React Native. We only need the raw module matrix
 * in order to build our own SVG, so this declares just that surface.
 */
declare module 'qrcode/lib/core/qrcode.js' {
  export interface QrCodeMatrix {
    modules: {
      size: number;
      /** 1 for a dark module, 0 for light. */
      get: (row: number, column: number) => number;
    };
  }

  export function create(
    data: string,
    options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'; version?: number },
  ): QrCodeMatrix;
}
