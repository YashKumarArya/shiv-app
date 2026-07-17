import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { asyncHandler } from '../lib/http.js';

const storage = multer.diskStorage({
  destination: env.uploadDir,
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

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
  for (let i = 0; i < total; i += 1) mask[i] = data[i * channels] < threshold ? 255 : 0;
  return mask;
};

/**
 * Turns a photo of a signature on paper into a transparent-background PNG:
 * trims the paper margin, then keeps only dark ink pixels (auto-thresholded),
 * making everything else transparent instead of a white rectangle.
 */
const extractSignature = async (filePath: string): Promise<string> => {
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

  const outPath = filePath.replace(path.extname(filePath), '.png');
  await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(outPath);
  if (outPath !== filePath) await fs.unlink(filePath);
  return outPath;
};

router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const finalPath = req.body?.type === 'signature' ? await extractSignature(req.file.path) : req.file.path;
  res.status(201).json({ path: `/uploads/${path.basename(finalPath)}` });
}));

export default router;
