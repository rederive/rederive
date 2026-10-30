// @rederive/flattenDeep — verified-recompose of lodash.flattendeep@4.4.0. quorum 3/3, differential 400/400, round 1. SIR: sir/flattenDeep.sir
// Clean-room reconstruction of lodash.flattendeep's flattenDeep
// Reconstructed from SIR contract and frozen oracle. No external imports.

const spreadableSymbol = typeof Symbol !== 'undefined' && Symbol.isConcatSpreadable;

const hasOwnProperty = Object.prototype.hasOwnProperty;
const propertyIsEnumerable = Object.prototype.propertyIsEnumerable;
const toString = Object.prototype.toString;

function isLength(value) {
  return typeof value === 'number'
    && value > -1
    && value % 1 === 0
    && value <= 9007199254740991;
}

function isObjectLike(value) {
  return value != null && typeof value === 'object';
}

function isFunction(value) {
  const tag = toString.call(value);
  return tag === '[object Function]' || tag === '[object GeneratorFunction]';
}

function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

function isArrayLikeObject(value) {
  return isObjectLike(value) && isArrayLike(value);
}

function isArguments(value) {
  return isArrayLikeObject(value)
    && hasOwnProperty.call(value, 'callee')
    && (!propertyIsEnumerable.call(value, 'callee')
        || toString.call(value) === '[object Arguments]');
}

function isFlattenable(value) {
  return Array.isArray(value)
    || isArguments(value)
    || !!(spreadableSymbol && value && value[spreadableSymbol]);
}

function arrayPush(array, values) {
  var index = -1;
  var length = values.length;
  var offset = array.length;
  while (++index < length) {
    array[offset + index] = values[index];
  }
  return array;
}

function baseFlatten(array, depth, predicate, isStrict, result) {
  var index = -1;
  var length = array.length;

  while (++index < length) {
    var value = array[index];
    if (depth > 0 && predicate(value)) {
      if (depth > 1) {
        baseFlatten(value, depth - 1, predicate, isStrict, result);
      } else {
        arrayPush(result, value);
      }
    } else if (!isStrict) {
      result[result.length] = value;
    }
  }
  return result;
}

function flattenDeep(array) {
  var length = array ? array.length : 0;
  return length ? baseFlatten(array, Infinity, isFlattenable, false, []) : [];
}

export default flattenDeep;
