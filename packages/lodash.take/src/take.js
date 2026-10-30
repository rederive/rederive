// @rederive/take — verified-recompose of lodash.take@4.1.1. quorum 3/3, differential 400/400, round 1. SIR: sir/take.sir
// Reconstructed from SIR contract: lodash.take@4.1.1 (MIT)
// Clean-room re-emission — emitter #3

const INFINITY = 1 / 0;
const MAX_INTEGER = 1.7976931348623157e+308;
const NAN = 0 / 0;
const symbolTag = '[object Symbol]';

const reTrim = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;

function isObject(value) {
  return !!value && (typeof value == 'object' || typeof value == 'function');
}

function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && Object.prototype.toString.call(value) == symbolTag);
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
    const sign = (value < 0) ? -1 : 1;
    return sign * MAX_INTEGER;
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

function baseSlice(array, start, end) {
  const length = array.length;
  // start is always 0 for take; start < 0 branch is dead
  // clamp end down to length
  if (end > length) {
    end = length;
  }
  // end < 0 branch is dead for take
  const outLen = (start > end) ? 0 : ((end - start) >>> 0);
  const result = new Array(outLen);
  for (let index = 0; index < outLen; index++) {
    result[index] = array[index + start];
  }
  return result;
}

function take(array, n, guard) {
  // NODE 1: container early-empty guard
  if (!(array && array.length)) {
    return [];
  }
  // NODE 2: resolve effective count N
  let N;
  if (guard || n === undefined) {
    N = 1;
  } else {
    N = toInteger(n);
  }
  // NODE 3: baseSlice(array, 0, N < 0 ? 0 : N)
  return baseSlice(array, 0, N < 0 ? 0 : N);
}

export default take;
