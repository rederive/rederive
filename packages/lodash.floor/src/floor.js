// @rederive/floor — verified-recompose of lodash.floor@4.0.4. quorum 3/3, differential 400/400, round 1. SIR: sir/floor.sir
// Clean-room re-emission of lodash.floor@4.0.4 — reconstructed from SIR contract.

const INFINITY = 1 / 0;
const MAX_INTEGER = 1.7976931348623157e+308;
const NAN = 0 / 0;
const reTrim = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;
const symbolTag = '[object Symbol]';
const nativeMin = Math.min;
const freeParseInt = parseInt;
const PRECISION_CAP = 292;

function isObject(v) {
  return !!v && (typeof v == 'object' || typeof v == 'function');
}

function isObjectLike(v) {
  return !!v && typeof v == 'object';
}

function isSymbol(v) {
  return typeof v == 'symbol' ||
    (isObjectLike(v) && Object.prototype.toString.call(v) == symbolTag);
}

function toNumber(value) {
  if (typeof value == 'number') {
    return value;
  }
  if (isSymbol(value)) {
    return NAN;
  }
  if (isObject(value)) {
    var other = typeof value.valueOf == 'function' ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value != 'string') {
    return (value === 0 ? value : +value);
  }
  var v = value.replace(reTrim, '');
  var isBinary = reIsBinary.test(v);
  if (isBinary || reIsOctal.test(v)) {
    return freeParseInt(v.slice(2), isBinary ? 2 : 8);
  }
  if (reIsBadHex.test(v)) {
    return NAN;
  }
  return +v;
}

function toFinite(value) {
  if (!value) {
    return value === 0 ? value : 0;
  }
  value = toNumber(value);
  if (value === INFINITY || value === -INFINITY) {
    var sign = (value < 0) ? -1 : 1;
    return sign * MAX_INTEGER;
  }
  return value === value ? value : 0;
}

function toInteger(value) {
  var result = toFinite(value);
  var remainder = result % 1;
  return result === result ? (remainder ? result - remainder : result) : 0;
}

function toString(value) {
  if (value == null) {
    return '';
  }
  if (typeof value == 'string') {
    return value;
  }
  if (isSymbol(value)) {
    return value.toString ? value.toString() : '';
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

function floor(number, precision) {
  number = toNumber(number);
  precision = precision === undefined ? 0 : nativeMin(toInteger(precision), PRECISION_CAP);

  if (precision) {
    // NODE-B: truthy precision — exp-shift trick
    var pair = (toString(number) + 'e').split('e');
    var value = Math.floor(+(pair[0] + 'e' + (+pair[1] + precision)));
    pair = (toString(value) + 'e').split('e');
    return +(pair[0] + 'e' + (+pair[1] - precision));
  }
  // NODE-A: falsy precision (0 or NaN)
  return Math.floor(number);
}

export default floor;
