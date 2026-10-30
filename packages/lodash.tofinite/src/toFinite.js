// @rederive/toFinite — verified-recompose of lodash.tofinite@4.12.1. quorum 3/3, differential 400/400, round 1. SIR: sir/toFinite.sir
const INFINITY = 1 / 0;
const MAX_INTEGER = 1.7976931348623157e+308;
const NAN = 0 / 0;
const reTrim = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;
const objectToString = Object.prototype.toString;

function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) == '[object Symbol]');
}

function isObject(value) {
  return !!value && (typeof value == 'object' || typeof value == 'function');
}

function toNumber(value) {
  // NODE N1
  if (typeof value == 'number') return value;
  // NODE N2
  if (isSymbol(value)) return NAN;
  // NODE N3
  if (isObject(value)) {
    var other = (typeof value.valueOf == 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  // NODE N4
  if (typeof value != 'string') {
    return value === 0 ? value : +value;
  }
  // NODE N5
  value = value.replace(reTrim, '');
  var isBinary = reIsBinary.test(value);
  return (isBinary || reIsOctal.test(value))
    ? parseInt(value.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex.test(value) ? NAN : +value);
}

export default function toFinite(value) {
  // NODE F1
  if (!value) {
    return value === 0 ? value : 0;
  }
  // NODE F2
  value = toNumber(value);
  // NODE F3
  if (value === INFINITY || value === -INFINITY) {
    var sign = (value < 0 ? -1 : 1);
    return sign * MAX_INTEGER;
  }
  // NODE F4
  return value === value ? value : 0;
}
