import crypto from 'node:crypto';
const ITER = 210000;
export function encryptStr(text, pw) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(pw, salt, ITER, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return Buffer.concat([salt, iv, enc, c.getAuthTag()]).toString('base64');
}
export function decryptStr(b64, pw) {
  const raw = Buffer.from(b64.trim(), 'base64');
  const salt = raw.subarray(0, 16), iv = raw.subarray(16, 28), rest = raw.subarray(28);
  const tag = rest.subarray(rest.length - 16), ct = rest.subarray(0, rest.length - 16);
  const key = crypto.pbkdf2Sync(pw, salt, ITER, 32, 'sha256');
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}
