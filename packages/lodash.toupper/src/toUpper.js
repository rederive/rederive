// @rederive/toUpper — verified-recompose of lodash.toupper@4.1.2. quorum 3/3, differential 400/400, round 1. SIR: sir/toUpper.sir
function isObjectLike(value) {
  return value !== null && typeof value === 'object';
}

function isSymbol(value) {
  const type = typeof value;
  return type === 'symbol' ||
    (type === 'object' && value !== null &&
      Object.prototype.toString.call(value) === '[object Symbol]');
}

function baseToString(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (isSymbol(value)) {
    return Symbol.prototype.toString.call(value);
  }
  const result = value + '';
  if (result === '0' && (1 / value) === -Infinity) {
    return '-0';
  }
  return result;
}

function lodashToString(value) {
  if (value == null) {
    return '';
  }
  return baseToString(value);
}

function toUpper(value) {
  return lodashToString(value).toUpperCase();
}

export default toUpper;
