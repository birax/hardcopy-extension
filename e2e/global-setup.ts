/**
 * Playwright global setup: make sure a Chrome build of the extension exists
 * and give it a deterministic extension ID.
 *
 * Hardcopy has no background service worker, so the usual "read the ID off
 * `context.serviceWorkers()[0].url()`" trick from Playwright's
 * chrome-extensions recipe does not work. Instead we inject a `key` into the
 * built manifest: Chrome derives an unpacked extension's ID from that public
 * key (ID = first 128 bits of SHA-256 of the DER key, hex mapped to a–p), so
 * we can compute the ID here and hand it to the tests via an env var.
 *
 * The key is generated fresh per run and only ever written into `.output/`
 * (build output, gitignored) — it is an identifier, not a credential.
 */

import { execSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(REPO_ROOT, '.output', 'chrome-mv3', 'manifest.json');

/** Env var the computed extension ID is passed to the tests in. */
export const EXTENSION_ID_ENV = 'HARDCOPY_EXTENSION_ID';

export default function globalSetup(): void {
  // Build unless the caller already did (CI builds as its own step so build
  // failures are attributed clearly; locally the default just works).
  if (process.env.HARDCOPY_E2E_SKIP_BUILD !== '1' || !existsSync(MANIFEST_PATH)) {
    execSync('pnpm build', { cwd: REPO_ROOT, stdio: 'inherit' });
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, unknown>;
  let key: string;
  if (typeof manifest.key === 'string') {
    key = manifest.key;
  } else {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    key = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    manifest.key = key;
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest));
  }
  process.env[EXTENSION_ID_ENV] = extensionIdFromKey(key);
}

/**
 * Compute the extension ID Chrome derives from a manifest `key`: the first
 * 16 bytes of SHA-256 of the DER-encoded public key, each nibble mapped to
 * the letters a–p ("mpdecimal" encoding).
 */
function extensionIdFromKey(base64Key: string): string {
  const digest = createHash('sha256').update(Buffer.from(base64Key, 'base64')).digest();
  return Array.from(digest.subarray(0, 16))
    .flatMap((byte) => [byte >> 4, byte & 0x0f])
    .map((nibble) => String.fromCharCode(0x61 + nibble))
    .join('');
}
