// @rederive/divide — verified-recompose of lodash.divide@4.9.0. quorum 3/3, differential 400/400, round 2. SIR: sir/divide.sir
// Reconstructed from SIR contract: lodash.divide@4.9.0
// createMathOperation(function(dividend, divisor){ return dividend / divisor; }, 1)

var INFINITY = 1 / 0;
var NAN = 0 / 0;
var symbolTag = '[object Symbol]';
var defaultValue = 1;

function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

function isSymbol(value) {
  return typeof value === 'symbol' ||
    (isObjectLike(value) && Object.prototype.toString.call(value) === symbolTag);
}

function baseToNumber(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (isSymbol(value)) {
    return NAN;
  }
  return +value;
}

function baseToString(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (isSymbol(value)) {
    return Symbol.prototype.toString.call(value);
  }
  var result = (value + '');
  if (result === '0' && (1 / value) === -INFINITY) {
    return '-0';
  }
  return result;
}

function operator(a, b) {
  return a / b;
}

function divide(value, other) {
  var result;
  if (value === undefined && other === undefined) {
    return defaultValue;
  }
  if (value !== undefined) {
    result = value;
  }
  if (other !== undefined) {
    if (result === undefined) {
      return other;
    }
    if (typeof value == 'string' || typeof other == 'string') {
      value = baseToString(value);
      other = baseToString(other);
    } else {
      value = baseToNumber(value);
      other = baseToNumber(other);
    }
    result = operator(value, other);
  }
  return result;
}

export default divide;
