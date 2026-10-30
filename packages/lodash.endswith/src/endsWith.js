// @rederive/endsWith — verified-recompose of lodash.endswith@4.2.1. quorum 3/3, differential 400/400, round 1. SIR: sir/endsWith.sir
// Clean-room re-emission of lodash.endswith@4.2.1 — endsWith
// Reconstructed from SIR contract; no original source consulted.

const INFINITY = 1 / 0;
const MAX_INTEGER = 1.7976931348623157e+308;
const NAN = 0 / 0;

const reTrim = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;
const symbolTag = '[object Symbol]';

const objectToString = Object.prototype.toString;
const freeParseInt = parseInt;

const symbolToString = typeof Symbol !== 'undefined' && Symbol.prototype
  ? Symbol.prototype.toString
  : null;

function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

function isObject(value) {
  return !!value && (typeof value === 'object' || typeof value === 'function');
}

function isSymbol(value) {
  return typeof value === 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) === symbolTag);
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (isSymbol(value)) return NAN;
  if (isObject(value)) {
    const other = (typeof value.valueOf === 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value !== 'string') return (value === 0) ? value : +value;
  value = value.replace(reTrim, '');
  const isBinary = reIsBinary.test(value);
  if (isBinary || reIsOctal.test(value)) {
    return freeParseInt(value.slice(2), isBinary ? 2 : 8);
  }
  return reIsBadHex.test(value) ? NAN : +value;
}

function toFinite(value) {
  if (!value) return (value === 0) ? value : 0;
  value = toNumber(value);
  if (value === INFINITY || value === -INFINITY) {
    const sign = (value < 0) ? -1 : 1;
    return sign * MAX_INTEGER;
  }
  return (value === value) ? value : 0;
}

function toInteger(value) {
  const result = toFinite(value);
  const remainder = result % 1;
  return (result === result) ? (remainder ? result - remainder : result) : 0;
}

function baseClamp(number, lower, upper) {
  if (number === number) {
    if (upper !== undefined) number = (number <= upper) ? number : upper;
    if (lower !== undefined) number = (number >= lower) ? number : lower;
  }
  return number;
}

function baseToString(value) {
  if (typeof value === 'string') return value;
  if (isSymbol(value)) {
    return symbolToString ? symbolToString.call(value) : '';
  }
  const result = (value + '');
  return (result === '0' && (1 / value) === -INFINITY) ? '-0' : result;
}

function toString(value) {
  return (value == null) ? '' : baseToString(value);
}

function endsWith(string, target, position) {
  string = toString(string);
  target = baseToString(target);
  const length = string.length;
  if (position === undefined) {
    position = length;
  } else {
    position = baseClamp(toInteger(position), 0, length);
  }
  const end = position;
  position = position - target.length;
  return (position >= 0) && (string.slice(position, end) === target);
}

export default endsWith;
