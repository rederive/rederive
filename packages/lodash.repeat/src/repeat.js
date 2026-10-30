// @rederive/repeat — verified-recompose of lodash.repeat@4.1.0. quorum 3/3, differential 400/400, round 1. SIR: sir/repeat.sir
// Clean-room re-emission of lodash.repeat@4.1.0
// Reconstructed solely from the SIR contract and frozen oracle.

const INFINITY = 1 / 0;
const MAX_SAFE_INTEGER = 9007199254740991;
const MAX_INTEGER = 1.7976931348623157e+308;
const NAN = 0 / 0;

const reTrim = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;

function isObject(value) {
  const type = typeof value;
  return value != null && (type == 'object' || type == 'function');
}

function isSymbol(value) {
  return typeof value == 'symbol' ||
    (value != null && typeof value == 'object' && Object.prototype.toString.call(value) == '[object Symbol]');
}

function toNumber(value) {
  if (typeof value == 'number') {
    return value;
  }
  if (isSymbol(value)) {
    return NAN;
  }
  if (isObject(value)) {
    const other = (typeof value.valueOf == 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value != 'string') {
    return (value === 0) ? value : +value;
  }
  // string path
  value = value.replace(reTrim, '');
  const isBinary = reIsBinary.test(value);
  if (isBinary || reIsOctal.test(value)) {
    return parseInt(value.slice(2), isBinary ? 2 : 8);
  }
  if (reIsBadHex.test(value)) {
    return NAN;
  }
  return +value;
}

function toFinite(value) {
  if (!value) {
    return (value === 0) ? value : 0;
  }
  value = toNumber(value);
  if (value === INFINITY || value === -INFINITY) {
    return (value < 0 ? -1 : 1) * MAX_INTEGER;
  }
  return (value === value) ? value : 0;
}

function toInteger(value) {
  const result = toFinite(value);
  const remainder = result % 1;
  return (result === result)
    ? (remainder ? result - remainder : result)
    : 0;
}

function baseToString(value) {
  if (typeof value == 'string') {
    return value;
  }
  if (isSymbol(value)) {
    return Symbol.prototype.toString.call(value);
  }
  const result = (value + '');
  if (result == '0' && (1 / value) == -INFINITY) {
    return '-0';
  }
  return result;
}

function toString(value) {
  if (value == null) {
    return '';
  }
  return baseToString(value);
}

function baseRepeat(string, n) {
  let result = '';
  if (!string || n < 1 || n > MAX_SAFE_INTEGER) {
    return result;
  }
  // exponentiation-by-squaring doubling loop
  do {
    if (n % 2) {
      result += string;
    }
    n = Math.floor(n / 2);
    if (n) {
      string += string;
    }
  } while (n);
  return result;
}

function isIterateeCall(value, index, object) {
  if (!isObject(object)) {
    return false;
  }
  const type = typeof index;
  if (type == 'number'
      ? (isArrayLike(object) && isIndex(index, object.length))
      : (type == 'string' && index in object)) {
    return Object.is(object[index], value);
  }
  return false;
}

function repeat(string, n, guard) {
  if (guard ? isIterateeCall(string, n, guard) : (n === undefined)) {
    n = 1;
  } else {
    n = toInteger(n);
  }
  return baseRepeat(toString(string), n);
}

export default repeat;
