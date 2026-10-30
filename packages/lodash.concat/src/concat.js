// @rederive/concat — verified-recompose of lodash.concat@4.5.0. quorum 3/3, differential 400/400, round 1. SIR: sir/concat.sir
const { hasOwnProperty, propertyIsEnumerable } = Object.prototype;

function isLength(n) {
  return typeof n === 'number' && n > -1 && n % 1 === 0 && n <= 9007199254740991;
}

function isObjectLike(value) {
  return value != null && typeof value === 'object';
}

function isFunction(value) {
  const tag = typeof value;
  return tag === 'function';
}

function isArrayLike(value) {
  return value != null && !isFunction(value) && isLength(value.length);
}

function isArguments(value) {
  if (!isObjectLike(value)) return false;
  if (!isArrayLike(value)) return false;
  if (!hasOwnProperty.call(value, 'callee')) return false;
  return !propertyIsEnumerable.call(value, 'callee') ||
    Object.prototype.toString.call(value) === '[object Arguments]';
}

function isFlattenable(value) {
  if (Array.isArray(value)) return true;
  if (isArguments(value)) return true;
  if (typeof Symbol !== 'undefined' && Symbol.isConcatSpreadable != null) {
    if (value && value[Symbol.isConcatSpreadable]) return true;
  }
  return false;
}

function concat(array, ...values) {
  // NODE 0: zero-argument fast path
  if (arguments.length === 0) return [];

  // NODE 2: seed result from array
  let result;
  if (Array.isArray(array)) {
    result = [];
    for (let i = 0; i < array.length; i++) {
      result.push(array[i]);
    }
  } else {
    result = [array];
  }

  // NODE 3: append each value, spreading flattenables ONE level
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (isFlattenable(value)) {
      for (let j = 0; j < value.length; j++) {
        result.push(value[j]);
      }
    } else {
      result.push(value);
    }
  }

  return result;
}

export default concat;
