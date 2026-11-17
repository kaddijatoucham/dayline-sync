import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ENC_FILE = path.join(ROOT, 'data', 'state.enc.json');
const KEY_FILE = path.join(ROOT, 'data', '.key');
const KEY_RE = /^[0-9a-f]{64}$/i;

async function readKey() {
  const fromEnv = (process.env.DAYLINE_STATE_KEY || '').trim();
  if (KEY_RE.test(fromEnv)) return Buffer.from(fromEnv, 'hex');
  try {
    const hex = (await fs.readFile(KEY_FILE, 'utf8')).trim();
    if (KEY_RE.test(hex)) return Buffer.from(hex, 'hex');
  } catch {}
  throw new Error('No decryption key. Set DAYLINE_STATE_KEY or place data/.key next to this checkout.');
}

try {
  const payload = JSON.parse(await fs.readFile(ENC_FILE, 'utf8'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', await readKey(), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]);
  process.stdout.write(plain.toString('utf8'));
} catch (err) {
  console.error(`Could not decrypt ${ENC_FILE}: ${err.message}`);
  process.exit(1);
}
