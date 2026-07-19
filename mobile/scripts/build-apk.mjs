import { spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rename, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appConfig = JSON.parse(await readFile(join(mobileRoot, 'app.json'), 'utf8')).expo;

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    '--yes',
    'eas-cli',
    'build',
    '--platform',
    'android',
    '--profile',
    'preview',
    '--clear-cache',
    '--wait',
    '--json',
  ],
  {
    cwd: mobileRoot,
    encoding: 'utf8',
    env: { ...process.env, EXPO_NO_DOTENV: '1' },
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['inherit', 'pipe', 'inherit'],
  },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

let payload;
try {
  payload = JSON.parse(result.stdout.trim());
} catch {
  throw new Error(`EAS completed but did not return readable build metadata:\n${result.stdout}`);
}

const builds = Array.isArray(payload)
  ? payload
  : Array.isArray(payload?.builds)
    ? payload.builds
    : [payload];
const build = builds.find((item) =>
  item?.artifacts?.applicationArchiveUrl || item?.artifacts?.buildUrl,
);
const artifactUrl = build?.artifacts?.applicationArchiveUrl ?? build?.artifacts?.buildUrl;
if (!artifactUrl) throw new Error('The completed EAS build did not provide an APK download URL.');
const finalAppConfig = JSON.parse(await readFile(join(mobileRoot, 'app.json'), 'utf8')).expo;

const safeName = (value) => value
  .replace(/\.apk$/i, '')
  .trim()
  .replace(/[^a-z0-9._-]+/gi, '-')
  .replace(/^-+|-+$/g, '');
const appName = safeName(finalAppConfig.name || appConfig.name || 'app');
const version = safeName(build.appVersion || finalAppConfig.version || appConfig.version || '0.0.0');
const buildNumber = safeName(String(
  build.appBuildVersion
    ?? finalAppConfig.android?.versionCode
    ?? appConfig.android?.versionCode
    ?? 'unknown',
));
const requestedName = process.env.APK_NAME ? safeName(process.env.APK_NAME) : '';
const baseName = requestedName || `${appName}-v${version}-build${buildNumber}`;
const outputDirectory = join(mobileRoot, 'builds');
await mkdir(outputDirectory, { recursive: true });

let outputPath = join(outputDirectory, `${baseName}.apk`);
try {
  await access(outputPath);
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  outputPath = join(outputDirectory, `${baseName}-${timestamp}.apk`);
} catch {
  // The preferred filename is available.
}

const temporaryPath = `${outputPath}.download`;
const response = await fetch(artifactUrl);
if (!response.ok || !response.body) {
  throw new Error(`APK download failed (${response.status} ${response.statusText})`);
}

try {
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporaryPath, { flags: 'wx' }));
  await rename(temporaryPath, outputPath);
} catch (error) {
  await unlink(temporaryPath).catch(() => undefined);
  throw error;
}

console.log(`\nAPK ready: ${outputPath}`);
