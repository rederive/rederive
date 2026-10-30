// @rederive/values — verified-recompose of lodash.values@4.3.0. quorum 3/3, differential 400/400, round 1. SIR: sir/values.sir
// Clean-room re-emission of lodash.values@4.3.0
// Reconstructed from SIR + frozen oracle. Zero dependencies.

const MAX_SAFE_INTEGER = 9007199254740991;

function isLength(n) {
  return typeof n === 'number' &&
    n > -1 &&
    n % 1 === 0 &&
    n <= MAX_SAFE_INTEGER;
}

function isFunction(value) {
  const tag = Object.prototype.toString.call(value);
  return tag === '[object Function]' || tag === '[object GeneratorFunction]';
}

function isArrayLike(value) {
  return value != null &&
    isLength(value.length) &&
    !isFunction(value);
}

function isArrayLikeObject(value) {
  return typeof value === 'object' && value !== null && isArrayLike(value);
}

function isArguments(value) {
  if (!isArrayLikeObject(value)) return false;
  if (!Object.prototype.hasOwnProperty.call(value, 'callee')) return false;
  return !Object.prototype.propertyIsEnumerable.call(value, 'callee') ||
    Object.prototype.toString.call(value) === '[object Arguments]';
}

// isIndex: canonical non-negative integer index string, >= 0, < length
const reIsUint = /^(?:0|[1-9]\d*)$/;
function isIndex(key, length) {
  return (typeof key === 'number' || reIsUint.test(key)) &&
    key > -1 &&
    key % 1 === 0 &&
    key < length;
}

function isPrototype(value) {
  const Ctor = value && value.constructor;
  const proto = (typeof Ctor === 'function' && Ctor.prototype) || Object.prototype;
  return value === proto;
}

// baseTimes(n, iteratee): ["0","1",...,String(n-1)]
function baseTimes(n, iteratee) {
  const result = [];
  for (let i = 0; i < n; i++) {
    result.push(iteratee(i));
  }
  return result;
}

// arrayLikeKeys: compute the key list for an array-like value
function arrayLikeKeys(value) {
  const isSeq = Array.isArray(value) || isArguments(value);
  // STEP A1: seed index keys for true arrays and arguments objects only
  let result = isSeq ? baseTimes(value.length, String) : [];
  // STEP A2: skipIndexes iff we seeded
  const skipIndexes = !!result.length;
  const length = result.length;

  // STEP A3: for..in to collect own enumerable keys not already covered
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      if (!(skipIndexes && (key === 'length' || isIndex(key, length)))) {
        result.push(key);
      }
    }
  }
  return result;
}

// baseKeys: Object.keys with isPrototype special case
function baseKeys(object) {
  if (!isPrototype(object)) {
    return Object.keys(object);
  }
  // prototype object: own enumerable keys except 'constructor'
  const result = [];
  for (const key in Object(object)) {
    if (Object.prototype.hasOwnProperty.call(object, key) && key !== 'constructor') {
      result.push(key);
    }
  }
  return result;
}

// keys: choose between array-like and plain-object key enumeration
function keys(object) {
  return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
}

// baseValues: map key list to values
function baseValues(object, props) {
  return props.map(key => object[key]);
}

// TOP LEVEL
function values(object) {
  return object ? baseValues(object, keys(object)) : [];
}

export default values;
