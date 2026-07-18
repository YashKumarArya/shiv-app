import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import {
  canonicalUploadPath,
  isValidUploadSignature,
  uploadFileName,
  uploadUrlTtlSeconds,
} from '../lib/uploads.js';
import { rasterImageMimeForFile, removeUploadArtifacts, uploadStoragePlan } from '../lib/rasterImages.js';

const declaredImageMimeTypes = new Set([
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const storage = multer.diskStorage({
  destination: env.uploadDir,
  // This is deliberately not a valid stored reference. Only after Sharp has
  // decoded the bytes do we choose the permanent filename and extension.
  filename: (_req, _file, cb) => cb(null, `${randomUUID()}.uploading`),
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!declaredImageMimeTypes.has(file.mimetype.toLowerCase())) {
      callback(new HttpError(400, 'Only JPEG, PNG, WebP, HEIC, or HEIF images are allowed'));
      return;
    }
    callback(null, true);
  },
});

const router = Router();

/**
 * The UUID alone is not authorization. Files are reachable without a bearer
 * header only through a short-lived URL signed by the API.
 */
export const signedUploads = Router();
signedUploads.get('/:filename', asyncHandler(async (req, res) => {
  const canonicalPath = `/uploads/${req.params.filename}`;
  const filename = uploadFileName(canonicalPath);
  if (!filename || !isValidUploadSignature(canonicalPath, req.query.expires, req.query.signature)) {
    throw new HttpError(401, 'Invalid or expired file link');
  }

  const filePath = path.join(path.resolve(env.uploadDir), filename);
  let mimeType: Awaited<ReturnType<typeof rasterImageMimeForFile>>;
  try {
    const stats = await fs.lstat(filePath);
    if (!stats.isFile()) throw new Error('Upload is not a regular file');
    mimeType = await rasterImageMimeForFile(filePath);
  } catch {
    throw new HttpError(404, 'File not found');
  }
  if (!mimeType) throw new HttpError(415, 'Stored file is not a supported image');

  const expires = Number(req.query.expires);
  const maxAge = Math.max(0, Math.min(uploadUrlTtlSeconds, expires - Math.floor(Date.now() / 1000)));
  res.set({
    'Cache-Control': `private, max-age=${maxAge}`,
    'Content-Disposition': `inline; filename="${filename}"`,
    'Content-Type': mimeType,
    'X-Content-Type-Options': 'nosniff',
  });
  res.sendFile(filename, { root: path.resolve(env.uploadDir), dotfiles: 'deny' });
}));

/**
 * Otsu's method: picks the brightness threshold that best splits an image's own
 * histogram into two classes (ink vs. paper), instead of guessing a fixed value.
 * Needed because real photos of paper have uneven lighting/shadows — a fixed
 * cutoff misclassifies dim paper as ink and the result comes out solid black.
 */
const otsuThreshold = (histogram: number[], total: number): number => {
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * histogram[t];

  let sumB = 0;
  let weightB = 0;
  let maxVariance = 0;
  let threshold = 127;

  for (let t = 0; t < 256; t += 1) {
    weightB += histogram[t];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;

    sumB += t * histogram[t];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) ** 2;

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  return threshold;
};

/** Builds a 0/255 alpha mask (ink vs. transparent) from grayscale pixel data. */
const buildInkMask = (data: Buffer, width: number, height: number, channels: number): Uint8Array => {
  const total = width * height;
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < total; i += 1) histogram[data[i * channels]] += 1;

  let threshold = otsuThreshold(histogram, total);

  // Guard: a signature stroke rarely covers more than a third of its (already
  // trimmed) bounding box. If Otsu's split still marks far more than that as
  // "ink" — e.g. a shadow gradient across the paper confused it — fall back to
  // the darkest MAX_INK_FRACTION of pixels instead of returning a near-solid image.
  const MAX_INK_FRACTION = 0.2;
  let inkCount = 0;
  for (let t = 0; t <= threshold; t += 1) inkCount += histogram[t];

  if (inkCount / total > MAX_INK_FRACTION) {
    let running = 0;
    for (let t = 0; t < 256; t += 1) {
      running += histogram[t];
      if (running / total >= MAX_INK_FRACTION) {
        threshold = t;
        break;
      }
    }
  }

  const mask = new Uint8Array(total);
  // Otsu commonly returns 0 for a clean black-on-white image. Include the
  // threshold bin itself or perfectly black signature pixels disappear.
  for (let i = 0; i < total; i += 1) mask[i] = data[i * channels] <= threshold ? 255 : 0;
  return mask;
};

/**
 * Turns a photo of a signature on paper into a transparent-background PNG:
 * trims the paper margin, then keeps only dark ink pixels (auto-thresholded),
 * making everything else transparent instead of a white rectangle.
 */
const extractSignature = async (filePath: string, outPath: string): Promise<void> => {
  const input = await fs.readFile(filePath);

  let trimmed: Buffer;
  try {
    trimmed = await sharp(input).rotate().trim({ threshold: 30 }).toBuffer();
  } catch {
    trimmed = await sharp(input).rotate().toBuffer();
  }

  const { data, info } = await sharp(trimmed).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const mask = buildInkMask(data, width, height, channels);

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = 30;
    rgba[i * 4 + 1] = 30;
    rgba[i * 4 + 2] = 30;
    rgba[i * 4 + 3] = mask[i];
  }

  await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(outPath);
  if (outPath !== filePath) await fs.unlink(filePath).catch(() => undefined);
};

/**
 * Give decoded uploads a canonical extension. HEIF is transcoded because many
 * Android versions and print WebViews cannot render it; the other supported
 * formats are renamed byte-for-byte so there is no avoidable quality loss.
 */
const normalizeUploadedImage = async (
  filePath: string,
  outPath: string,
  transcodeToJpeg: boolean,
): Promise<void> => {
  if (transcodeToJpeg) {
    await sharp(filePath, { limitInputPixels: 40_000_000, failOn: 'error' })
      .rotate()
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toFile(outPath);
    await fs.unlink(filePath).catch(() => undefined);
  } else {
    await fs.rename(filePath, outPath);
  }
};

router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let finalPath = req.file.path;
  try {
    // MIME headers can be spoofed. Let the image decoder verify the actual file
    // and reject decompression bombs before any path is saved in the database.
    const metadata = await sharp(
      req.file.path,
      { limitInputPixels: 40_000_000, failOn: 'error' },
    ).metadata();
    const storagePlan = metadata.format ? uploadStoragePlan(metadata.format) : null;
    if (!storagePlan) throw new HttpError(400, 'Unsupported image format');

    const isSignature = req.body?.type === 'signature';
    // Plan the target before any decoder writes it, so cleanup also removes a
    // partial output if Sharp fails halfway through processing.
    finalPath = req.file.path.replace(/\.uploading$/, isSignature ? '.png' : storagePlan.extension);
    if (isSignature) await extractSignature(req.file.path, finalPath);
    else await normalizeUploadedImage(req.file.path, finalPath, storagePlan.transcodeToJpeg);
    const storedPath = canonicalUploadPath(`/uploads/${path.basename(finalPath)}`);
    if (!storedPath) throw new HttpError(500, 'Could not create a safe file reference');
    res.status(201).json({ path: storedPath });
  } catch (error) {
    await removeUploadArtifacts(req.file.path, finalPath);
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Upload a valid image smaller than 40 megapixels');
  }
}));

export default router;
