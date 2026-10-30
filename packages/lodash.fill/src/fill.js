// @rederive/fill — verified-recompose of lodash.fill@3.4.0. quorum 3/3, differential 400/400, round 1. SIR: sir/fill.sir
// Clean-room re-emission of lodash.fill@3.4.0 from SIR contract.
// No external dependencies; all helpers inlined per spec.

const INFINITY = Infinity;
const MAX_SAFE_INTEGER = 9007199254740991;
const MAX_INTEGER = 1.7976931348623157e+308;
const MAX_ARRAY_LENGTH = 4294967295;

const reTrim = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;
const reIsUint = /^(?:0|[1-9]\d*)$/;

const funcTag = '[object Function]';
const genTag = '[object GeneratorFunction]';
const symbolTag = '[object Symbol]';

const objToString = Object.prototype.toString;

function isObject(v) {
  const type = typeof v;
  return !!v && (type === 'object' || type === 'function');
}

function isObjectLike(v) {
  return !!v && typeof v === 'object';
}

function isSymbol(v) {
  return typeof v === 'symbol' || (isObjectLike(v) && objToString.call(v) === symbolTag);
}

function isLength(v) {
  return typeof v === 'number' && v > -1 && v % 1 === 0 && v <= MAX_SAFE_INTEGER;
}

function isFunction(v) {
  const tag = isObject(v) ? objToString.call(v) : '';
  return tag === funcTag || tag === genTag;
}

function isArrayLike(v) {
  return v != null && isLength(v.length) && !isFunction(v);
}

function isIndex(v, len) {
  len = (len == null) ? MAX_SAFE_INTEGER : len;
  return !!len && (typeof v === 'number' || reIsUint.test(v)) &&
         (v > -1 && v % 1 === 0 && v < len);
}

function eq(a, b) {
  return a === b || (a !== a && b !== b);
}

function isIterateeCall(value, index, object) {
  if (!isObject(object)) return false;
  const t = typeof index;
  let ok;
  if (t === 'number') {
    ok = isArrayLike(object) && isIndex(index, object.length);
  } else if (t === 'string') {
    ok = (index in object);
  } else {
    return false;
  }
  if (ok) return eq(object[index], value);
  return false;
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (isSymbol(value)) return NaN;
  if (isObject(value)) {
    const other = (typeof value.valueOf === 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value !== 'string') {
    return value === 0 ? value : +value;
  }
  value = value.replace(reTrim, '');
  const isBinary = reIsBinary.test(value);
  if (isBinary || reIsOctal.test(value)) {
    return parseInt(value.slice(2), isBinary ? 2 : 8);
  }
  if (reIsBadHex.test(value)) return NaN;
  return +value;
}

function toFinite(value) {
  if (!value) return value === 0 ? value : 0;
  value = toNumber(value);
  if (value === INFINITY || value === -INFINITY) {
    const sign = value < 0 ? -1 : 1;
    return sign * MAX_INTEGER;
  }
  return value === value ? value : 0;
}

function toInteger(value) {
  const result = toFinite(value);
  const remainder = result % 1;
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

function baseFill(array, value, start, end) {
  // B0
  const length = array.length;

  // B1
  start = toInteger(start);
  if (start < 0) {
    start = (-start > length) ? 0 : (length + start);
  }

  // B2: critical raw-compare bug-preserve
  end = (end === undefined || end > length) ? length : toInteger(end);

  // B3
  if (end < 0) {
    end += length;
  }

  // B4
  end = (start > end) ? 0 : toLength(end);

  // B5
  while (start < end) {
    array[start] = value;
    start = start + 1;
  }

  // B6
  return array;
}

function fill(array, value, start, end) {
  // N0
  const length = array ? array.length : 0;

  // N1
  if (!length) return [];

  // N2: iteratee-call guard
  if (start && typeof start !== 'number' && isIterateeCall(array, value, start)) {
    start = 0;
    end = length;
  }

  // N3
  return baseFill(array, value, start, end);
}

export default fill;
