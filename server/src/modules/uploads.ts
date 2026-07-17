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
 * Turns a photo of a signature on paper into a transparent-background PNG:
 * trims the paper margin, then keeps only dark ink pixels (thresholded),
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

  const INK_THRESHOLD = 170;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const gray = data[i * channels];
    rgba[i * 4] = 30;
    rgba[i * 4 + 1] = 30;
    rgba[i * 4 + 2] = 30;
    rgba[i * 4 + 3] = gray < INK_THRESHOLD ? 255 : 0;
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
