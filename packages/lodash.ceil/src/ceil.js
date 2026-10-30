// @rederive/ceil — verified-recompose of lodash.ceil@4.0.4. quorum 3/3, differential 400/400, round 1. SIR: sir/ceil.sir
const INFINITY = 1 / 0;
const MAX_INTEGER = 1.7976931348623157e+308;
const NAN = 0 / 0;
const reTrim = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;
const UPPER_CLAMP = 292;

function isSymbol(value) {
  const type = typeof value;
  return type === 'symbol' ||
    (type === 'object' && value !== null &&
      Object.prototype.toString.call(value) === '[object Symbol]');
}

function isObject(value) {
  const type = typeof value;
  return value !== null && (type === 'object' || type === 'function');
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
  if (reIsBadHex.test(value)) return NAN;
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

function baseToString(value) {
  if (typeof value === 'string') return value;
  if (isSymbol(value)) return '';
  const result = (value + '');
  return (result === '0' && (1 / value) === -INFINITY) ? '-0' : result;
}

function toString(value) {
  if (value == null) return '';
  return baseToString(value);
}

function ceil(number, precision) {
  number = toNumber(number);
  precision = precision === undefined ? 0 : Math.min(toInteger(precision), UPPER_CLAMP);

  if (precision) {
    const S = toString(number);
    let pair = (S + 'e').split('e');
    const value = Math.ceil(Number(pair[0] + 'e' + ((+pair[1]) + precision)));
    const S2 = toString(value);
    pair = (S2 + 'e').split('e');
    return Number(pair[0] + 'e' + ((+pair[1]) - precision));
  }
  return Math.ceil(number);
}

export default ceil;
