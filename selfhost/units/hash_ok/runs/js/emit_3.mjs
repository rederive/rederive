import { createHash } from 'node:crypto';

const PIN = /^[0-9a-f]{64}$/;

export function hash_ok(text, want) {
  if (want === undefined || want === null) return true;
  if (typeof want !== 'string' || !PIN.test(want)) {
    throw new Error('hashOk: a pin is 64 lowercase hex digits (got ' + (typeof want === 'string' ? JSON.stringify(want) : typeof want) + ')');
  }
  if (typeof text === 'string' && !text.isWellFormed()) {
    throw new Error('hashOk: text with a lone surrogate has no UTF-8 form of its own');
  }
  return createHash('sha256').update(text).digest('hex') === want;
}
