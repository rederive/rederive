// @rederive/hashSync — verified-recompose of bcryptjs@2.4.3. quorum 3/3, differential 200/200, round 2. SIR: sir/hashSync.sir
import { P_ORIG, S_ORIG, C_ORIG, BASE64_CODE, BASE64_INDEX } from './hashSync.data.js';

function _streamtoword(data, offp) {
  let word = 0;
  let off = offp;
  for (let i = 0; i < 4; i++) {
    word = ((word << 8) | (data[off] & 0xff)) >>> 0;
    off = (off + 1) % data.length;
  }
  return { word: word | 0, off };
}

function _encipher(lr, off, P, S) {
  let L = lr[off];
  let R = lr[off + 1];
  L ^= P[0];
  for (let i = 0; i < 16; i += 2) {
    // R depends on L
    let n = ((S[0x000 | ((L >>> 24) & 0xff)] + S[0x100 | ((L >>> 16) & 0xff)]) | 0) ^ S[0x200 | ((L >>> 8) & 0xff)];
    n = (n + S[0x300 | (L & 0xff)]) | 0;
    R ^= n ^ P[i + 1];
    // L depends on R
    n = ((S[0x000 | ((R >>> 24) & 0xff)] + S[0x100 | ((R >>> 16) & 0xff)]) | 0) ^ S[0x200 | ((R >>> 8) & 0xff)];
    n = (n + S[0x300 | (R & 0xff)]) | 0;
    L ^= n ^ P[i + 2];
  }
  lr[off] = R ^ P[17];
  lr[off + 1] = L;
}

function _key(data, P, S) {
  let offp = 0;
  let sw;
  for (let i = 0; i < 18; i++) {
    sw = _streamtoword(data, offp);
    P[i] ^= sw.word;
    offp = sw.off;
  }
  const lr = new Int32Array(2);
  for (let i = 0; i < 18; i += 2) {
    _encipher(lr, 0, P, S);
    P[i] = lr[0];
    P[i + 1] = lr[1];
  }
  for (let i = 0; i < 1024; i += 2) {
    _encipher(lr, 0, P, S);
    S[i] = lr[0];
    S[i + 1] = lr[1];
  }
}

function _ekskey(saltb, data, P, S) {
  let offp = 0;
  let sw;
  for (let i = 0; i < 18; i++) {
    sw = _streamtoword(data, offp);
    P[i] ^= sw.word;
    offp = sw.off;
  }
  let offsk = 0;
  const lr = new Int32Array(2);
  for (let i = 0; i < 18; i += 2) {
    sw = _streamtoword(saltb, offsk);
    lr[0] ^= sw.word;
    offsk = sw.off;
    sw = _streamtoword(saltb, offsk);
    lr[1] ^= sw.word;
    offsk = sw.off;
    _encipher(lr, 0, P, S);
    P[i] = lr[0];
    P[i + 1] = lr[1];
  }
  for (let i = 0; i < 1024; i += 2) {
    sw = _streamtoword(saltb, offsk);
    lr[0] ^= sw.word;
    offsk = sw.off;
    sw = _streamtoword(saltb, offsk);
    lr[1] ^= sw.word;
    offsk = sw.off;
    _encipher(lr, 0, P, S);
    S[i] = lr[0];
    S[i + 1] = lr[1];
  }
}

function _crypt(passwordb, saltb, rounds) {
  if (rounds < 4 || rounds > 31) throw new Error("Illegal number of rounds (4-31): " + rounds);
  if (saltb.length !== 16) throw new Error("Illegal salt length: " + saltb.length + " != 16");
  rounds = (1 << rounds) >>> 0;
  const P = Int32Array.from(P_ORIG);
  const S = Int32Array.from(S_ORIG);
  _ekskey(saltb, passwordb, P, S);
  for (let i = 0; i < rounds; i++) {
    _key(passwordb, P, S);
    _key(saltb, P, S);
  }
  const cdata = Int32Array.from(C_ORIG);
  const clen = 6;
  for (let i = 0; i < 64; i++) {
    for (let j = 0; j < clen >> 1; j++) {
      _encipher(cdata, j << 1, P, S);
    }
  }
  const hashBytes = [];
  for (let i = 0; i < clen; i++) {
    hashBytes.push((cdata[i] >>> 24) & 0xff);
    hashBytes.push((cdata[i] >>> 16) & 0xff);
    hashBytes.push((cdata[i] >>> 8) & 0xff);
    hashBytes.push(cdata[i] & 0xff);
  }
  return hashBytes;
}

function base64_encode(b, len) {
  if (len <= 0 || len > b.length) throw new Error("Illegal len: " + len);
  const CODE = BASE64_CODE;
  let off = 0;
  let out = "";
  while (off < len) {
    let c1 = b[off++] & 0xff;
    out += CODE[(c1 >> 2) & 0x3f];
    c1 = (c1 & 0x03) << 4;
    if (off >= len) {
      out += CODE[c1 & 0x3f];
      break;
    }
    let c2 = b[off++] & 0xff;
    c1 |= (c2 >> 4) & 0x0f;
    out += CODE[c1 & 0x3f];
    c1 = (c2 & 0x0f) << 2;
    if (off >= len) {
      out += CODE[c1 & 0x3f];
      break;
    }
    c2 = b[off++] & 0xff;
    c1 |= (c2 >> 6) & 0x03;
    out += CODE[c1 & 0x3f];
    out += CODE[c2 & 0x3f];
  }
  return out;
}

function base64_decode(s, len) {
  if (len <= 0) throw new Error("Illegal len: " + len);
  const IDX = (ch) => {
    const code = ch.charCodeAt(0);
    return (code < BASE64_INDEX.length) ? BASE64_INDEX[code] : -1;
  };
  let off = 0;
  const slen = s.length;
  let olen = 0;
  const out = [];
  while (off < slen - 1 && olen < len) {
    const c1 = IDX(s[off++]);
    const c2 = IDX(s[off++]);
    if (c1 === -1 || c2 === -1) break;
    out.push(((c1 << 2) >>> 0 | ((c2 & 0x30) >> 4)) & 0xff);
    olen++;
    if (olen >= len || off >= slen) break;
    const c3 = IDX(s[off++]);
    if (c3 === -1) break;
    out.push((((c2 & 0x0f) << 4) >>> 0 | ((c3 & 0x3c) >> 2)) & 0xff);
    olen++;
    if (olen >= len || off >= slen) break;
    const c4 = IDX(s[off++]);
    out.push((((c3 & 0x03) << 6) >>> 0 | c4) & 0xff);
    olen++;
  }
  return out;
}

function _utf8Encode(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let cp = s.charCodeAt(i);
    if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < s.length) {
      const lo = s.charCodeAt(i + 1);
      if (lo >= 0xDC00 && lo <= 0xDFFF) {
        cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
        i++;
      }
    }
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xC0 | (cp >> 6));
      out.push(0x80 | (cp & 0x3F));
    } else if (cp < 0x10000) {
      out.push(0xE0 | (cp >> 12));
      out.push(0x80 | ((cp >> 6) & 0x3F));
      out.push(0x80 | (cp & 0x3F));
    } else {
      out.push(0xF0 | (cp >> 18));
      out.push(0x80 | ((cp >> 12) & 0x3F));
      out.push(0x80 | ((cp >> 6) & 0x3F));
      out.push(0x80 | (cp & 0x3F));
    }
  }
  return out;
}

function _hash(s, salt) {
  // SALT PARSE
  if (salt[0] !== '$' || salt[1] !== '2') {
    throw new Error("Invalid salt version: " + salt.substring(0, 2));
  }
  let minor;
  let offset;
  if (salt[2] === '$') {
    minor = String.fromCharCode(0);
    offset = 3;
  } else {
    minor = salt[2];
    if ((minor !== 'a' && minor !== 'b' && minor !== 'y') || salt[3] !== '$') {
      throw new Error("Invalid salt revision: " + salt.substring(2, 4));
    }
    offset = 4;
  }
  // MISSING-ROUNDS check
  if (salt.charAt(offset + 2) > '$') {
    throw new Error("Missing salt rounds");
  }
  // COST
  const r1 = parseInt(salt.substring(offset, offset + 1), 10) * 10;
  const r2 = parseInt(salt.substring(offset + 1, offset + 2), 10);
  const rounds = r1 + r2;
  // SALT BODY
  const real_salt = salt.substring(offset + 3, offset + 25);
  // PASSWORD BYTES
  if (minor >= 'a') {
    s += "\x00";
  }
  const passwordb = _utf8Encode(s);
  const saltb = base64_decode(real_salt, 16);
  // _crypt
  const hashBytesAll = _crypt(passwordb, saltb, rounds);
  const hashBytes = hashBytesAll.slice(0, 24);
  // OUTPUT-ASSEMBLY
  let res = "$2";
  if (minor >= 'a') res += minor;
  res += "$";
  if (rounds < 10) res += "0";
  res += String(rounds);
  res += "$";
  res += base64_encode(saltb, saltb.length);
  res += base64_encode(hashBytes, 23);
  return res;
}

export function hashSync(s, salt) {
  if (salt === undefined) salt = 10;
  if (typeof salt === 'number') {
    throw new Error("genSaltSync not implemented (out of contract)");
  }
  if (typeof s !== 'string' || typeof salt !== 'string') {
    throw new Error("Illegal arguments: " + typeof s + ", " + typeof salt);
  }
  return _hash(s, salt);
}

export default hashSync;
