// @rederive/toLower — verified-recompose of lodash.tolower@4.1.2. quorum 3/3, differential 400/400, round 1. SIR: sir/toLower.sir
// Blind clean-room re-emission of lodash.tolower@4.1.2 — emitter #2
// Implements the exact two-stage pipeline specified in toLower.sir.

function isSymbol(value) {
  if (typeof value === 'symbol') return true;
  // object-like: truthy AND typeof === 'object'
  if (value && typeof value === 'object') {
    return Object.prototype.toString.call(value) === '[object Symbol]';
  }
  return false;
}

function baseToString(value) {
  // NODE A2: string fast-path
  if (typeof value === 'string') return value;

  // NODE A3: symbol path
  if (isSymbol(value)) {
    return Symbol.prototype.toString.call(value);
  }

  // NODE A4: general coercion + -0 reconstruction
  const result = value + '';
  if (result === '0' && (1 / value) === -Infinity) return '-0';
  return result;
}

function toString(value) {
  // NODE A1: nullish guard (loose equality — catches both null and undefined)
  // eslint-disable-next-line eqeqeq
  if (value == null) return '';
  return baseToString(value);
}

function toLower(value) {
  return toString(value).toLowerCase();
}

export default toLower;
