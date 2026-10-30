// @rederive/startsWith — verified-recompose of lodash.startswith@4.2.1. quorum 3/3, differential 400/400, round 1. SIR: sir/startsWith.sir
// Clean-room re-emission of lodash.startswith@4.2.1 startsWith
// Reconstructed from SIR contract + frozen oracle only.

const INFINITY = 1 / 0;
const MAX_INTEGER = 1.7976931348623157e+308;
const symbolTag = '[object Symbol]';
const reTrim = /^\s+|\s+$/g;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;

function isObjectLike(value) {
  return value != null && typeof value === 'object';
}

function isObject(value) {
  const type = typeof value;
  return value != null && (type === 'object' || type === 'function');
}

function isSymbol(value) {
  return typeof value === 'symbol' ||
    (isObjectLike(value) && Object.prototype.toString.call(value) === symbolTag);
}

function toNumber(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (isSymbol(value)) {
    return NaN;
  }
  if (isObject(value)) {
    const other = (typeof value.valueOf === 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value !== 'string') {
    return value === 0 ? value : +value;
    // NOTE: +bigint throws TypeError "Cannot convert a BigInt value to a number"
  }
  // string branch
  value = value.replace(reTrim, '');
  if (reIsBinary.test(value)) {
    return parseInt(value.slice(2), 2);
  }
  if (reIsOctal.test(value)) {
    return parseInt(value.slice(2), 8);
  }
  if (reIsBadHex.test(value)) {
    return NaN;
  }
  return +value;
}

function toFinite(value) {
  if (!value) {
    return value === 0 ? value : 0;
  }
  value = toNumber(value);
  if (value === INFINITY || value === -INFINITY) {
    const sign = (value < 0) ? -1 : 1;
    return sign * MAX_INTEGER;
  }
  return value === value ? value : 0;
}

function toInteger(value) {
  const r = toFinite(value);
  const rem = r % 1;
  if (r === r) {
    return rem ? (r - rem) : r;
  }
  return 0;
}

function baseClamp(number, lower, upper) {
  if (number === number) {
    if (upper !== undefined) {
      number = number <= upper ? number : upper;
    }
    if (lower !== undefined) {
      number = number >= lower ? number : lower;
    }
  }
  return number;
}

function baseToString(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (isSymbol(value)) {
    return Symbol.prototype.toString.call(value);
  }
  const result = (value + '');
  if (result === '0' && (1 / value) === -INFINITY) {
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

function startsWith(string, target, position) {
  // node S: coerce string
  string = toString(string);

  // node P: coerce position and clamp to [0, string.length]
  position = baseClamp(toInteger(position), 0, string.length);

  // node T: coerce target (baseToString, NOT toString — nullish becomes "null"/"undefined")
  target = baseToString(target);

  // node R: slice comparison
  return string.slice(position, position + target.length) === target;
}

export default startsWith;
