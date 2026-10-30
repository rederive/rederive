// @rederive/lt — verified-recompose of lodash.lt@3.9.2. quorum 3/3, differential 400/400, round 1. SIR: sir/lt.sir
const NAN = 0 / 0;
const reTrim = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;
const symbolTag = '[object Symbol]';
const objectToString = Object.prototype.toString;
const freeParseInt = parseInt;

function isObjectLike(v) {
  return (!!v) && (typeof v === 'object');
}

function isSymbol(v) {
  return (typeof v === 'symbol') ||
    (isObjectLike(v) && objectToString.call(v) === symbolTag);
}

function isObject(v) {
  return (!!v) && (typeof v === 'object' || typeof v === 'function');
}

function toNumber(value) {
  // N1: already a number
  if (typeof value === 'number') {
    return value;
  }
  // N2: symbol -> NaN
  if (isSymbol(value)) {
    return NAN;
  }
  // N3: object/function -> unwrap via valueOf
  if (isObject(value)) {
    const other = (typeof value.valueOf === 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  // N4: not a string (boolean, null, undefined, bigint, etc.)
  if (typeof value !== 'string') {
    return (value === 0) ? value : (+value);
  }
  // N5: string path
  value = value.replace(reTrim, '');
  const isBinary = reIsBinary.test(value);
  if (isBinary || reIsOctal.test(value)) {
    return freeParseInt(value.slice(2), isBinary ? 2 : 8);
  }
  return reIsBadHex.test(value) ? NAN : (+value);
}

function lt(value, other) {
  // L1: string-pair guard — only skip coercion when BOTH are primitive strings
  if (!(typeof value === 'string' && typeof other === 'string')) {
    value = toNumber(value);
    other = toNumber(other);
  }
  // L2: compare
  return value < other;
}

export default lt;
