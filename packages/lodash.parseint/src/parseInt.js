// @rederive/parseInt — verified-recompose of lodash.parseint@4.0.2. quorum 3/3, differential 400/400, round 1. SIR: sir/parseInt.sir
const reTrim = /^\s+|\s+$/g;
const reHasHexPrefix = /^0x/i;
const INFINITY = 1 / 0;
const nativeParseInt = parseInt;

function isSymbol(value) {
  return typeof value === 'symbol';
}

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

function toString(value) {
  if (value == null) {
    return '';
  }
  return baseToString(value);
}

function lodashParseInt(string, radix, guard) {
  // NODE 1 — RADIX RESOLUTION
  if (guard || radix == null) {
    radix = 0;
  } else if (radix) {
    radix = +radix;
  }
  // NODE 2 — STRING COERCION + TRIM
  string = toString(string).replace(reTrim, '');
  // NODE 3 — DELEGATE TO NATIVE PARSEINT
  return nativeParseInt(string, radix || (reHasHexPrefix.test(string) ? 16 : 10));
}

export default lodashParseInt;
