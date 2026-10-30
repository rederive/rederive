// hash_ok input generator (selfhost round 5). Inputs only: every verdict is computed by the pinned real hashOk.
// Pin values are DERIVED from the text (sha-256 of some byte rendering of it) so the inputs reach the match branch;
// whether they match, or throw, is the real function's answer, never this file's.
// Non-ASCII characters are built from code points (C(...)) so no editor or tool can silently normalize them.
import { createHash } from 'node:crypto';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const H = (t) => sha(Buffer.from(t, 'utf8'));
const C = (...cps) => String.fromCodePoint(...cps);
const U = (...units) => String.fromCharCode(...units);   // raw UTF-16 code units (lone surrogates)

const E_ACUTE = C(0xe9), COMB_ACUTE = C(0x301), GRIN = C(0x1f600), FFFD = C(0xfffd);
const CAFE_NFC = 'caf' + E_ACUTE, CAFE_NFD = 'cafe' + COMB_ACUTE;

const TEXTS = [
  '', 'a', 'Hello, World!\n', 'line1\r\nline2', 'nul' + C(0) + 'inside', CAFE_NFC, CAFE_NFD,
  C(0x65e5, 0x672c, 0x8a9e), 'a' + GRIN + 'b', C(0x1f469, 0x200d, 0x1f469, 0x200d, 0x1f467), C(0xfeff) + 'bom',
  C(0x10ffff), C(0xa0) + 'nbsp', FFFD, C(0x130), C(0xdf),
  // SHA-256 block / padding boundaries, in BYTES
  ...[55, 56, 57, 63, 64, 65, 119, 120, 128, 1000].map((k) => 'a'.repeat(k)),
  // byte length != UTF-16 length != scalar count, across the same boundaries
  E_ACUTE.repeat(28), E_ACUTE.repeat(32), GRIN.repeat(14), GRIN.repeat(16), C(0x20ac).repeat(19) + 'ab',
];

// well-formed pins that are NOT the digest of t (R3 -> false)
const wrongPins = (t) => [H(t + ' '), sha(Buffer.from(t, 'utf16le')), sha(Buffer.from(t, 'latin1')), H(t.normalize('NFD')),
  H(t.normalize('NFC')), '0'.repeat(64), 'f'.repeat(64), H('')];
// non-pins (R2 -> throws)
const badPins = (t) => {
  const h = H(t);
  return ['', h.toUpperCase(), h.slice(0, 32) + h.slice(32).toUpperCase(), ' ' + h, h + '\n', h + ' ', '\n' + h, h.slice(0, 63),
    h + '0', h.slice(0, 63) + 'g', h.slice(0, 63) + C(0x660), h.slice(0, 62) + C(0xff10), 'A'.repeat(64), '0', 'false', 'null',
    'undefined', ' ', 'x'];
};

export function genInputs(n, rnd) {
  const out = [];
  for (const t of TEXTS) out.push([t, H(t)], [t, null]);
  const vt = ['abc', CAFE_NFC, GRIN, E_ACUTE.repeat(28), '', 'a'.repeat(64)];
  wrongPins('abc').forEach((w, i) => out.push([vt[i % vt.length], wrongPins(vt[i % vt.length])[i]]));
  badPins('abc').forEach((w, i) => out.push([vt[i % vt.length], badPins(vt[i % vt.length])[i]]));
  out.push([CAFE_NFC, H(CAFE_NFD)], [FFFD + 'x', H(FFFD + 'x')], ['abc', H('abc')]);
  // js-only widening (outside the abstract SIG; the encoder routes these to the js extension)
  out.push(
    ['abc', undefined], ['abc'], ['abc', 0], ['abc', false], ['abc', 0n], ['abc', true], ['abc', [H('abc')]], ['abc', {}],
    [U(0xd800), null], [U(0xd800), undefined], [U(0xd800), H(FFFD)], [U(0xd800), ''], [U(0xd800), 0],
    [U(0xde00, 0xd83d), H(FFFD + FFFD)], ['a' + U(0xd83d), H('a' + FFFD)], [U(0xdfff) + 'z', 'x'],
    [new Uint8Array([97, 98, 99]), H('abc')], [new Uint8Array([0xff, 0xfe, 0xed]), sha(Buffer.from([0xff, 0xfe, 0xed]))],
    [new Uint8Array([]), H('')], [new Uint8Array([1, 2]), null], [new Uint8Array([97]), 'A'],
    [5, null], [5, H('5')], [5, 'x'], [null, null], [null, H('')], [true, H('true')], [['abc'], H('abc')], [{}, undefined],
  );
  // shuffle so both the frozen and the held-out slice see every stratum
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  // seeded in-domain fill: mostly matching or well-formed-but-wrong pins, some none, a few non-pins
  const alpha = ['a', 'b', 'Z', '0', ' ', '\n', '"', '\\', C(0), E_ACUTE, C(0xdf), C(0x20ac), C(0x65e5), GRIN, COMB_ACUTE, FFFD, C(0x10000)];
  const target = out.length < n ? n + 12 : out.length + 12;   // head-room: the stamp drops duplicate inputs
  while (out.length < target) {
    const len = Math.floor(rnd() * (rnd() < 0.2 ? 200 : 20));
    let t = ''; for (let i = 0; i < len; i++) t += alpha[Math.floor(rnd() * alpha.length)];
    const r = rnd();
    if (r < 0.4) out.push([t, H(t)]);
    else if (r < 0.7) { const w = wrongPins(t); out.push([t, w[Math.floor(rnd() * w.length)]]); }
    else if (r < 0.85) out.push([t, null]);
    else { const b = badPins(t); out.push([t, b[Math.floor(rnd() * b.length)]]); }
  }
  return out;
}
