import fs from 'fs/promises';

export type RasterImageMime =
  | 'image/avif'
  | 'image/bmp'
  | 'image/gif'
  | 'image/heic'
  | 'image/heif'
  | 'image/jpeg'
  | 'image/png'
  | 'image/tiff'
  | 'image/webp';

const startsWith = (value: Buffer, bytes: readonly number[]) =>
  value.length >= bytes.length && bytes.every((byte, index) => value[index] === byte);

const ascii = (value: Buffer, start: number, length: number) =>
  value.length >= start + length ? value.toString('ascii', start, start + length) : '';

/**
 * Identify the raster formats accepted by the historical uploader from their
 * bytes, never from a user-controlled filename or Content-Type header.
 */
export const rasterImageMimeFromHeader = (header: Buffer): RasterImageMime | null => {
  if (startsWith(header, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(header, 0, 4) === 'RIFF' && ascii(header, 8, 4) === 'WEBP') return 'image/webp';
  if (['GIF87a', 'GIF89a'].includes(ascii(header, 0, 6))) return 'image/gif';
  if (ascii(header, 0, 2) === 'BM') return 'image/bmp';
  if (
    startsWith(header, [0x49, 0x49, 0x2a, 0x00])
    || startsWith(header, [0x4d, 0x4d, 0x00, 0x2a])
  ) return 'image/tiff';

  // HEIF/HEIC and AVIF are ISO-BMFF files. The ftyp box normally comes first;
  // inspecting its declared brands is sufficient for a safe response MIME and
  // avoids asking libvips to decode old phone images just to serve them.
  if (ascii(header, 4, 4) === 'ftyp' && header.length >= 12) {
    const declaredSize = header.readUInt32BE(0);
    const boxEnd = Math.min(header.length, declaredSize >= 12 ? declaredSize : header.length);
    const brands = new Set<string>();
    brands.add(ascii(header, 8, 4));
    // Bytes 12..15 are the minor version; compatible brands follow it.
    for (let offset = 16; offset + 4 <= boxEnd; offset += 4) brands.add(ascii(header, offset, 4));

    if (brands.has('avif') || brands.has('avis')) return 'image/avif';
    if (['heic', 'heix', 'hevc', 'hevx'].some((brand) => brands.has(brand))) return 'image/heic';
    if (brands.has('mif1') || brands.has('msf1')) return 'image/heif';
  }

  return null;
};

/** Read only enough of a protected file to determine its response MIME. */
export const rasterImageMimeForFile = async (filePath: string): Promise<RasterImageMime | null> => {
  const handle = await fs.open(filePath, 'r');
  try {
    const header = Buffer.alloc(512);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return rasterImageMimeFromHeader(header.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
};

/** Best-effort cleanup for both the Multer temp file and any partial output. */
export const removeUploadArtifacts = async (...filePaths: string[]): Promise<void> => {
  await Promise.all(
    [...new Set(filePaths)].map((filePath) => fs.unlink(filePath).catch(() => undefined)),
  );
};

export type DecodedUploadFormat = 'heif' | 'jpeg' | 'png' | 'webp';

export interface UploadStoragePlan {
  extension: '.jpg' | '.png' | '.webp';
  /** HEIF is decoded to JPEG for reliable Android, print-WebView and browser rendering. */
  transcodeToJpeg: boolean;
}

/** The server-selected storage name is based only on Sharp's decoded format. */
export const uploadStoragePlan = (format: string): UploadStoragePlan | null => {
  switch (format) {
    case 'jpeg': return { extension: '.jpg', transcodeToJpeg: false };
    case 'png': return { extension: '.png', transcodeToJpeg: false };
    case 'webp': return { extension: '.webp', transcodeToJpeg: false };
    case 'heif': return { extension: '.jpg', transcodeToJpeg: true };
    default: return null;
  }
};
