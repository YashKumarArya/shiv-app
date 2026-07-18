import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  rasterImageMimeFromHeader,
  removeUploadArtifacts,
  uploadStoragePlan,
} from '../src/lib/rasterImages.js';

const isoImageHeader = (majorBrand: string, compatibleBrands: string[] = []) => {
  const size = 16 + compatibleBrands.length * 4;
  const header = Buffer.alloc(size);
  header.writeUInt32BE(size, 0);
  header.write('ftyp', 4, 'ascii');
  header.write(majorBrand, 8, 'ascii');
  compatibleBrands.forEach((brand, index) => header.write(brand, 16 + index * 4, 'ascii'));
  return header;
};

describe('raster image byte recognition', () => {
  it('uses actual bytes instead of a filename or client MIME declaration', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(rasterImageMimeFromHeader(png), 'image/png');
    assert.equal(rasterImageMimeFromHeader(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
    assert.equal(rasterImageMimeFromHeader(Buffer.from('GIF89a')), 'image/gif');
  });

  it('distinguishes HEIC and AVIF ISO-BMFF brands', () => {
    assert.equal(rasterImageMimeFromHeader(isoImageHeader('heic', ['mif1'])), 'image/heic');
    assert.equal(rasterImageMimeFromHeader(isoImageHeader('mif1', ['avif'])), 'image/avif');
  });

  it('rejects non-image and incomplete headers', () => {
    assert.equal(rasterImageMimeFromHeader(Buffer.from('<script>alert(1)</script>')), null);
    assert.equal(rasterImageMimeFromHeader(Buffer.from('RIFF')), null);
  });
});

describe('decoded upload storage plan', () => {
  it('keeps decoded JPEG, PNG and WebP bytes under matching extensions', () => {
    assert.deepEqual(uploadStoragePlan('jpeg'), { extension: '.jpg', transcodeToJpeg: false });
    assert.deepEqual(uploadStoragePlan('png'), { extension: '.png', transcodeToJpeg: false });
    assert.deepEqual(uploadStoragePlan('webp'), { extension: '.webp', transcodeToJpeg: false });
  });

  it('converts decoded HEIF to a broadly renderable high-quality JPEG', () => {
    assert.deepEqual(uploadStoragePlan('heif'), { extension: '.jpg', transcodeToJpeg: true });
    assert.equal(uploadStoragePlan('svg'), null);
  });

  it('cleans both a temporary input and a partial final output after failure', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shivapp-upload-cleanup-'));
    const temporary = path.join(directory, 'photo.uploading');
    const partialOutput = path.join(directory, 'photo.png');
    try {
      await Promise.all([fs.writeFile(temporary, 'temporary'), fs.writeFile(partialOutput, 'partial')]);
      await removeUploadArtifacts(temporary, partialOutput, temporary);
      await assert.rejects(fs.access(temporary));
      await assert.rejects(fs.access(partialOutput));
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
