// @rederive/toString — verified-recompose of lodash.tostring@4.1.4. quorum 3/3, differential 400/400, round 1. SIR: sir/toString.sir
// Blind clean-room re-emission of lodash.tostring@4.1.4 toString
// Reconstructed from SIR contract only. Private helpers inlined per DEPENDS-ON: none.

const symbolToString = typeof Symbol !== 'undefined' ? Symbol.prototype.toString : null;
const INFINITY = 1 / 0;

function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

function isSymbol(value) {
  return typeof value === 'symbol' ||
    (isObjectLike(value) && Object.prototype.toString.call(value) === '[object Symbol]');
}

function baseToString(value) {
  // B1. String fast-path
  if (typeof value === 'string') {
    return value;
  }
  // B2. Symbol path
  if (isSymbol(value)) {
    return symbolToString ? symbolToString.call(value) : '';
  }
  // B3. Generic coercion + (-0) sentinel
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY)
    ? '-0'
    : result;
}

function toString(value) {
  // Step 1: nullish guard (catches both null and undefined)
  if (value == null) {
    return '';
  }
  return baseToString(value);
}

export default toString;
