// @rederive/lastIndexOf — verified-recompose of lodash.lastindexof@4.0.5. quorum 3/3, differential 400/400, round 1. SIR: sir/lastIndexOf.sir
// Clean-room re-emission of lodash.lastindexof@4.0.5 — lastIndexOf
// Reconstructed from SIR + frozen oracle. No original source consulted.

const INFINITY = 1 / 0;
const MAX_INTEGER = 1.7976931348623157e+308;

function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

function isObject(value) {
  return !!value && (typeof value == 'object' || typeof value == 'function');
}

function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && Object.prototype.toString.call(value) == '[object Symbol]');
}

function toNumber(value) {
  if (typeof value == 'number') return value;
  if (isSymbol(value)) return NaN;
  if (isObject(value)) {
    var other = (typeof value.valueOf == 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value != 'string') return (value === 0 ? value : +value);
  value = value.replace(/^\s+|\s+$/g, '');
  var isBinary = /^0b[01]+$/i.test(value);
  return (isBinary || /^0o[0-7]+$/i.test(value))
    ? parseInt(value.slice(2), isBinary ? 2 : 8)
    : (/^[-+]0x[0-9a-f]+$/i.test(value) ? NaN : +value);
}

function toFinite(value) {
  if (!value) return (value === 0 ? value : 0);
  value = toNumber(value);
  if (value === INFINITY || value === -INFINITY) {
    return (value < 0 ? -1 : 1) * MAX_INTEGER;
  }
  return (value === value ? value : 0);
}

function toInteger(value) {
  var result = toFinite(value);
  var remainder = result % 1;
  return (result === result)
    ? (remainder ? result - remainder : result)
    : 0;
}

function baseIsNaN(value) {
  return value !== value;
}

function baseFindIndex(array, predicate, fromIndex, fromRight) {
  // fromRight=true: search from fromIndex down to 0
  var i = fromIndex + 1;
  while (i--) {
    if (predicate(array[i], i, array)) return i;
  }
  return -1;
}

function lastIndexOf(array, value, fromIndex) {
  // node-1: length resolution & empty/nullish early-out
  var length = array ? array.length : 0;
  if (!length) return -1;

  // node-2: compute upper-bound index (exclusive cursor)
  var index = length;
  if (fromIndex !== undefined) {
    index = toInteger(fromIndex);
    index = (index < 0
      ? Math.max(length + index, 0)
      : Math.min(index, length - 1)
    ) + 1;
  }

  // node-3: NaN branch
  if (value !== value) {
    return baseFindIndex(array, baseIsNaN, index - 1, true);
  }

  // node-4: general === branch
  while (index--) {
    if (array[index] === value) return index;
  }
  return -1;
}

export default lastIndexOf;
