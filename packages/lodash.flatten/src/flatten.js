// @rederive/flatten — verified-recompose of lodash.flatten@4.4.0. quorum 3/3, differential 400/400, round 1. SIR: sir/flatten.sir
const SPREADABLE = typeof Symbol !== 'undefined' && Symbol.isConcatSpreadable;

function isLength(value) {
  return typeof value === 'number' &&
    value > -1 &&
    value % 1 === 0 &&
    value <= 9007199254740991;
}

function isObjectLike(value) {
  return value != null && typeof value === 'object';
}

function isFunction(value) {
  const tag = Object.prototype.toString.call(value);
  return tag === '[object Function]' || tag === '[object AsyncFunction]' ||
    tag === '[object GeneratorFunction]' || tag === '[object Proxy]' ||
    typeof value === 'function';
}

function isArrayLike(value) {
  return value != null && !isFunction(value) && isLength(value.length);
}

function isArguments(value) {
  if (!isObjectLike(value) || !isArrayLike(value)) return false;
  if (!Object.prototype.hasOwnProperty.call(value, 'callee')) return false;
  const descriptor = Object.getOwnPropertyDescriptor(value, 'callee');
  if (descriptor && descriptor.enumerable) {
    return Object.prototype.toString.call(value) === '[object Arguments]';
  }
  return true;
}

function isFlattenable(value) {
  return Array.isArray(value) ||
    isArguments(value) ||
    !!(SPREADABLE && value && value[SPREADABLE]);
}

function flatten(array) {
  const length = array ? array.length : 0;
  if (!length) return [];

  const result = [];
  for (let index = 0; index < length; index++) {
    const value = array[index];
    if (isFlattenable(value)) {
      const innerLength = value.length;
      for (let j = 0; j < innerLength; j++) {
        result[result.length] = value[j];
      }
    } else {
      result[result.length] = value;
    }
  }
  return result;
}

export default flatten;
