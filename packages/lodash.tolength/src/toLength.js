// @rederive/toLength — verified-recompose of lodash.tolength@4.0.4. quorum 3/3, differential 400/400, round 1. SIR: sir/toLength.sir
// Clean-room reconstruction of lodash toLength@4.0.4
// Implements the full pipeline: toLength -> baseClamp -> toInteger -> toFinite -> toNumber

const INFINITY = 1 / 0;
const MAX_INTEGER = 1.7976931348623157e+308;
const MAX_ARRAY_LENGTH = 4294967295;

const reTrim = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;

function isObject(v) {
  return !!v && (typeof v == 'object' || typeof v == 'function');
}

function isObjectLike(v) {
  return !!v && typeof v == 'object';
}

function isSymbol(v) {
  return typeof v == 'symbol' ||
    (isObjectLike(v) && Object.prototype.toString.call(v) == '[object Symbol]');
}

function toNumber(value) {
  if (typeof value == 'number') return value;
  if (isSymbol(value)) return NaN;
  if (isObject(value)) {
    var other = (typeof value.valueOf == 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value != 'string') return value === 0 ? value : +value;
  value = value.replace(reTrim, '');
  var isBinary = reIsBinary.test(value);
  if (isBinary || reIsOctal.test(value)) {
    return parseInt(value.slice(2), isBinary ? 2 : 8);
  }
  return reIsBadHex.test(value) ? NaN : +value;
}

function toFinite(value) {
  if (!value) return value === 0 ? value : 0;
  value = toNumber(value);
  if (value === INFINITY || value === -INFINITY) {
    var sign = value < 0 ? -1 : 1;
    return sign * MAX_INTEGER;
  }
  return value === value ? value : 0;
}

function toInteger(value) {
  var result = toFinite(value);
  var remainder = result % 1;
  return result === result ? (remainder ? result - remainder : result) : 0;
}

function baseClamp(number, lower, upper) {
  if (number === number) {
    if (upper !== undefined) number = number <= upper ? number : upper;
    if (lower !== undefined) number = number >= lower ? number : lower;
  }
  return number;
}

function toLength(value) {
  return value ? baseClamp(toInteger(value), 0, MAX_ARRAY_LENGTH) : 0;
}

export default toLength;
