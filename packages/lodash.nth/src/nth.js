// @rederive/nth — verified-recompose of lodash.nth@4.11.2. quorum 3/3, differential 400/400, round 1. SIR: sir/nth.sir
// Clean-room re-emission of lodash.nth@4.11.2
// Reconstructed from SIR contract — no original source consulted.

const INFINITY        = 1 / 0;
const MAX_SAFE_INTEGER = 9007199254740991;
const MAX_INTEGER     = 1.7976931348623157e+308;
const NAN             = 0 / 0;
const symbolTag       = '[object Symbol]';

const reTrim      = /^\s+|\s+$/g;
const reIsBadHex  = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary  = /^0b[01]+$/i;
const reIsOctal   = /^0o[0-7]+$/i;
const reIsUint    = /^(?:0|[1-9]\d*)$/;

const freeParseInt    = parseInt;
const objectToString  = Object.prototype.toString;

function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

function isObject(value) {
  const type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) == symbolTag);
}

function toNumber(value) {
  // NODE A
  if (typeof value == 'number') return value;
  // NODE B
  if (isSymbol(value)) return NAN;
  // NODE C
  if (isObject(value)) {
    let other = (typeof value.valueOf == 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  // NODE D
  if (typeof value != 'string') {
    return (value === 0 ? value : +value);
  }
  // NODE E (value is a string)
  value = value.replace(reTrim, '');
  const isBinary = reIsBinary.test(value);
  if (isBinary || reIsOctal.test(value)) {
    return freeParseInt(value.slice(2), isBinary ? 2 : 8);
  }
  return reIsBadHex.test(value) ? NAN : +value;
}

function toFinite(value) {
  // NODE A: falsy short-circuit
  if (!value) {
    return (value === 0 ? value : 0);
  }
  // NODE B
  value = toNumber(value);
  // NODE C: infinities -> clamp
  if (value === INFINITY || value === -INFINITY) {
    return (value < 0 ? -1 : 1) * MAX_INTEGER;
  }
  // NODE D: NaN -> 0, else value
  return (value === value ? value : 0);
}

function toInteger(value) {
  const result = toFinite(value);
  const remainder = result % 1;
  return (result === result)
    ? (remainder ? result - remainder : result)
    : 0;
}

function isIndex(value, length) {
  length = (length == null) ? MAX_SAFE_INTEGER : length;
  return !!length &&
    (typeof value == 'number' || reIsUint.test(value)) &&
    (value > -1 && value % 1 == 0 && value < length);
}

function baseNth(array, n) {
  const length = array.length;
  if (!length) return undefined;
  n += (n < 0 ? length : 0);
  return isIndex(n, length) ? array[n] : undefined;
}

function nth(array, n) {
  return (array && array.length) ? baseNth(array, toInteger(n)) : undefined;
}

export default nth;
