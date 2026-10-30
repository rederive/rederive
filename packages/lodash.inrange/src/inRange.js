// @rederive/inRange — verified-recompose of lodash.inrange@3.3.6. quorum 3/3, differential 400/400, round 1. SIR: sir/inRange.sir
const INFINITY = 1 / 0;
const MAX_INTEGER = 1.7976931348623157e+308;
const NAN = 0 / 0;
const symbolTag = '[object Symbol]';
const reTrim = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;
const freeParseInt = parseInt;
const objectToString = Object.prototype.toString;
const nativeMax = Math.max;
const nativeMin = Math.min;

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
  if (typeof value === 'number') {
    return value;
  }
  if (isSymbol(value)) {
    return NAN;
  }
  if (isObject(value)) {
    var other = (typeof value.valueOf === 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value !== 'string') {
    return (value === 0) ? value : (+value);
  }
  value = value.replace(reTrim, '');
  var isBinary = reIsBinary.test(value);
  if (isBinary || reIsOctal.test(value)) {
    return freeParseInt(value.slice(2), isBinary ? 2 : 8);
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
    var sign = (value < 0) ? -1 : 1;
    return sign * MAX_INTEGER;
  }
  return (value === value) ? value : 0;
}

function baseInRange(number, start, end) {
  return (number >= nativeMin(start, end)) && (number < nativeMax(start, end));
}

function inRange(number, start, end) {
  start = toFinite(start);
  if (end === undefined) {
    end = start;
    start = 0;
  } else {
    end = toFinite(end);
  }
  number = toNumber(number);
  return baseInRange(number, start, end);
}

export default inRange;
