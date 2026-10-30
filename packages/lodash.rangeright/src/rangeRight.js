// @rederive/rangeRight — verified-recompose of lodash.rangeright@4.2.0. quorum 3/3, differential 400/400, round 1. SIR: sir/rangeRight.sir
// Clean-room reconstruction of lodash.rangeright@4.2.0 (createRange(true))
// Implements the full SIR contract exactly.

const INFINITY = 1 / 0;
const MAX_SAFE_INTEGER = 9007199254740991;
const MAX_INTEGER = 1.7976931348623157e+308;
const NAN = 0 / 0;

const reTrim     = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary  = /^0b[01]+$/i;
const reIsOctal  = /^0o[0-7]+$/i;
const reIsUint   = /^(?:0|[1-9]\d*)$/;

const funcTag = '[object Function]';
const genTag  = '[object GeneratorFunction]';
const symbolTag = '[object Symbol]';

function isObject(v) {
  if (!v) return false;
  const t = typeof v;
  return t === 'object' || t === 'function';
}

function isObjectLike(v) {
  return !!v && typeof v === 'object';
}

function isSymbol(v) {
  return typeof v === 'symbol' ||
    (isObjectLike(v) && Object.prototype.toString.call(v) === symbolTag);
}

function isFunction(v) {
  if (!isObject(v)) return false;
  const tag = Object.prototype.toString.call(v);
  return tag === funcTag || tag === genTag;
}

function isLength(v) {
  return typeof v === 'number' && v > -1 && v % 1 === 0 && v <= MAX_SAFE_INTEGER;
}

function isArrayLike(v) {
  return v != null && isLength(v.length) && !isFunction(v);
}

function isIndex(v, len) {
  len = (len == null ? MAX_SAFE_INTEGER : len);
  return !!len &&
    (typeof v === 'number' || reIsUint.test(v)) &&
    (v > -1 && v % 1 === 0 && v < len);
}

function eq(a, b) {
  return a === b || (a !== a && b !== b);
}

function isIterateeCall(value, index, object) {
  if (!isObject(object)) return false;
  const type = typeof index;
  let match;
  if (type === 'number') {
    match = isArrayLike(object) && isIndex(index, object.length);
  } else if (type === 'string') {
    match = (index in object);
  } else {
    match = false;
  }
  if (match) return eq(object[index], value);
  return false;
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (isSymbol(value)) return NAN;
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
  return reIsBadHex.test(value) ? NAN : +value;
}

function toFinite(value) {
  if (!value) {
    return value === 0 ? value : 0;
  }
  value = toNumber(value);
  if (value === INFINITY || value === -INFINITY) {
    const sign = value < 0 ? -1 : 1;
    return sign * MAX_INTEGER;
  }
  return value === value ? value : 0;
}

function baseRange(start, end, step, fromRight) {
  let index = -1;
  let length = Math.max(Math.ceil((end - start) / (step || 1)), 0);
  const result = new Array(length);
  while (length--) {
    const idx = fromRight ? length : (++index);
    result[idx] = start;
    start += step;
  }
  return result;
}

export default function rangeRight(start, end, step) {
  // NODE 1 — iteratee-call guard
  if (step && typeof step !== 'number' && isIterateeCall(start, end, step)) {
    end = undefined;
    step = undefined;
  }

  // NODE 2 — coerce start
  start = toFinite(start);

  // NODE 3 — resolve end / 1-arg form
  if (end === undefined) {
    end = start;
    start = 0;
  } else {
    end = toFinite(end);
  }

  // NODE 4 — resolve step
  if (step === undefined) {
    step = start < end ? 1 : -1;
  } else {
    step = toFinite(step);
  }

  // NODE 5 — build via baseRange with fromRight = true
  return baseRange(start, end, step, true);
}
