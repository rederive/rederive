// @rederive/round — verified-recompose of lodash.round@4.0.4. quorum 3/3, differential 400/400, round 1. SIR: sir/round.sir
// Clean-room re-emission of lodash.round@4.0.4
// Reconstructed from SIR + frozen oracle. No original source consulted.

const INFINITY = 1 / 0;
const MAX_INTEGER = 1.7976931348623157e+308;

const reTrim = /^\s+|\s+$/g;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const freeParseInt = parseInt;

function isObject(value) {
  const type = typeof value;
  return value != null && (type === 'object' || type === 'function');
}

function isSymbol(value) {
  const type = typeof value;
  return type === 'symbol' ||
    (type === 'object' && value != null && Object.prototype.toString.call(value) === '[object Symbol]');
}

function toNumber(value) {
  // Step 1: already a number
  if (typeof value === 'number') {
    return value;
  }
  // Step 2: symbol -> NaN
  if (isSymbol(value)) {
    return NaN;
  }
  // Step 3: object/function -> unwrap via valueOf
  if (isObject(value)) {
    const other = (typeof value.valueOf === 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  // Step 4: non-string after unwrap
  if (typeof value !== 'string') {
    return (value === 0 ? value : +value);
  }
  // Step 5: string coercion
  value = value.replace(reTrim, '');
  const isBinary = reIsBinary.test(value);
  if (isBinary || reIsOctal.test(value)) {
    return freeParseInt(value.slice(2), isBinary ? 2 : 8);
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
    return (value < 0 ? -1 : 1) * MAX_INTEGER;
  }
  return value === value ? value : 0;
}

function toInteger(value) {
  const result = toFinite(value);
  const remainder = result % 1;
  return result === result ? (remainder ? result - remainder : result) : 0;
}

// Lodash toString / baseToString — critical: -0 maps to '-0', not '0'
function baseToString(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (isSymbol(value)) {
    return Symbol.prototype.toString ? Symbol.prototype.toString.call(value) : '';
  }
  const result = (value + '');
  return (result === '0' && (1 / value) === -INFINITY) ? '-0' : result;
}

function lodashToString(value) {
  return value == null ? '' : baseToString(value);
}

function round(number, precision) {
  // B0: coerce number
  number = toNumber(number);

  // B1: coerce and clamp precision (upper clamp only at 292; no lower clamp)
  precision = Math.min(toInteger(precision === undefined ? 0 : precision), 292);

  // B2: branch on truthiness of precision
  if (precision) {
    // B2b: nonzero precision -> exponential shift (string-based)
    let pair = (lodashToString(number) + 'e').split('e');
    const value = Math.round(+(pair[0] + 'e' + (+pair[1] + precision)));
    pair = (lodashToString(value) + 'e').split('e');
    return +(pair[0] + 'e' + (+pair[1] - precision));
  }

  // B2a: precision is 0 (or -0) -> direct Math.round
  return Math.round(number);
}

export default round;
