import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { NextFunction, Request, Response } from 'express';

type UploadsModule = typeof import('../src/lib/uploads.js');
let uploads: UploadsModule;
let uploadDir: string;
let signedUploads: typeof import('../src/modules/uploads.js')['signedUploads'];

before(async () => {
  // uploads.ts reads the normal validated environment because its HMAC secret
  // is production configuration. These defaults are isolated to this process.
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost/test';
  process.env.JWT_SECRET ??= 'test-only-upload-signing-secret-32-characters';
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'shivapp-upload-test-'));
  process.env.UPLOAD_DIR = uploadDir;
  uploads = await import('../src/lib/uploads.js');
  ({ signedUploads } = await import('../src/modules/uploads.js'));
});

after(async () => {
  await fs.rm(uploadDir, { recursive: true, force: true });
});

describe('canonical upload references', () => {
  const uuid = '123e4567-e89b-42d3-a456-426614174000';

  it('recognizes current and historical UUID raster names', () => {
    assert.equal(uploads.canonicalUploadPath(`/uploads/${uuid}.jpg`), `/uploads/${uuid}.jpg`);
    assert.equal(uploads.canonicalUploadPath(`/uploads/${uuid}.JFIF`), `/uploads/${uuid}.JFIF`);
    assert.equal(uploads.canonicalUploadPath(`/uploads/${uuid}.tiff`), `/uploads/${uuid}.tiff`);
    assert.equal(uploads.canonicalUploadPath(`/uploads/${uuid}`), `/uploads/${uuid}`);
  });

  it('removes a temporary signature but keeps the canonical database value', () => {
    const signedLooking = `/uploads/${uuid}.png?expires=1999999999&signature=temporary`;
    assert.equal(uploads.canonicalUploadPath(signedLooking), `/uploads/${uuid}.png`);
  });

  it('rejects path traversal, absolute URLs, arbitrary suffixes and non-UUID names', () => {
    assert.equal(uploads.canonicalUploadPath(`/uploads/../${uuid}.jpg`), null);
    assert.equal(uploads.canonicalUploadPath(`/uploads/%2e%2e%2f${uuid}.jpg`), null);
    assert.equal(uploads.canonicalUploadPath(`https://example.com/uploads/${uuid}.jpg`), null);
    assert.equal(uploads.canonicalUploadPath(`/uploads/${uuid}.uploading`), null);
    assert.equal(uploads.canonicalUploadPath('/uploads/company-logo.png'), null);
  });
});

describe('signed upload capabilities', () => {
  const now = 1_800_000_000;
  const canonical = '/uploads/123e4567-e89b-42d3-a456-426614174000';

  it('signs extensionless legacy references without exposing an unsigned URL', () => {
    const signed = uploads.signedUploadPath(canonical, now);
    assert.ok(signed);
    const url = new URL(signed, 'https://api.example.test');
    assert.equal(url.pathname, canonical);
    assert.equal(
      uploads.isValidUploadSignature(canonical, url.searchParams.get('expires'), url.searchParams.get('signature'), now),
      true,
    );
  });

  it('rejects an expired capability and filename tampering', () => {
    const signed = uploads.signedUploadPath(canonical, now)!;
    const url = new URL(signed, 'https://api.example.test');
    const expires = url.searchParams.get('expires');
    const signature = url.searchParams.get('signature');
    assert.equal(uploads.isValidUploadSignature(canonical, expires, signature, now + 901), false);
    assert.equal(uploads.isValidUploadSignature(`${canonical}.png`, expires, signature, now), false);
  });
});

describe('protected legacy file response', () => {
  it('serves an extensionless raster with sniffed MIME and nosniff', async () => {
    const filename = '123e4567-e89b-42d3-a456-426614174001';
    const canonical = `/uploads/${filename}`;
    await fs.writeFile(
      path.join(uploadDir, filename),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );

    const signed = uploads.signedUploadPath(canonical)!;
    const url = new URL(signed, 'https://api.example.test');
    const routeHandler = (
      signedUploads as unknown as {
        stack: Array<{ route: { stack: Array<{ handle: (req: Request, res: Response, next: NextFunction) => void }> } }>;
      }
    ).stack[0].route.stack[0].handle;

    const served = new Promise<{ headers: Record<string, string>; filename: string; root: string }>((resolve, reject) => {
      let headers: Record<string, string> = {};
      const response = {
        set(values: Record<string, string>) {
          headers = values;
          return this;
        },
        sendFile(servedFilename: string, options: { root: string }) {
          resolve({ headers, filename: servedFilename, root: options.root });
        },
      } as unknown as Response;
      const request = {
        params: { filename },
        query: {
          expires: url.searchParams.get('expires'),
          signature: url.searchParams.get('signature'),
        },
      } as unknown as Request;
      routeHandler(request, response, reject);
    });

    const result = await served;
    assert.equal(result.filename, filename);
    assert.equal(result.root, path.resolve(uploadDir));
    assert.equal(result.headers['Content-Type'], 'image/png');
    assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
    assert.match(result.headers['Cache-Control'], /^private, max-age=/);
  });

  it('does not follow a signed UUID symlink', async () => {
    const filename = '123e4567-e89b-42d3-a456-426614174002.png';
    const canonical = `/uploads/${filename}`;
    const target = path.join(uploadDir, 'not-an-upload.png');
    await fs.writeFile(target, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    await fs.symlink(target, path.join(uploadDir, filename));

    const signed = uploads.signedUploadPath(canonical)!;
    const url = new URL(signed, 'https://api.example.test');
    const routeHandler = (
      signedUploads as unknown as {
        stack: Array<{ route: { stack: Array<{ handle: (req: Request, res: Response, next: NextFunction) => void }> } }>;
      }
    ).stack[0].route.stack[0].handle;

    const error = await new Promise<Error>((resolve) => {
      const request = {
        params: { filename },
        query: {
          expires: url.searchParams.get('expires'),
          signature: url.searchParams.get('signature'),
        },
      } as unknown as Request;
      const response = {
        set() { assert.fail('A symlink must not reach response headers'); },
        sendFile() { assert.fail('A symlink must not be served'); },
      } as unknown as Response;
      routeHandler(request, response, (routeError) => resolve(routeError));
    });

    assert.equal((error as Error & { status?: number }).status, 404);
  });
});
