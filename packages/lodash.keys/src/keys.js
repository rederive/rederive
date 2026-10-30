// @rederive/keys — verified-recompose of lodash.keys@4.2.0. quorum 3/3, differential 400/400, round 1. SIR: sir/keys.sir
// Clean-room re-emission of lodash.keys@4.2.0 — reconstructed from SIR contract only.

const MAX_SAFE_INTEGER = 9007199254740991;
const argsTag = '[object Arguments]';
const funcTag = '[object Function]';
const genTag  = '[object GeneratorFunction]';
const reIsUint = /^(?:0|[1-9]\d*)$/;

const objectProto = Object.prototype;
const hasOwnProp = objectProto.hasOwnProperty;
const toString = objectProto.toString;
const propertyIsEnumerable = objectProto.propertyIsEnumerable;
const nativeKeys = (function(Object_) {
  return function(o) { return Object_.keys(Object_(o)); };
}(Object));

function isLength(value) {
  return typeof value === 'number'
    && value > -1
    && value % 1 === 0
    && value <= MAX_SAFE_INTEGER;
}

function isObjectLike(value) {
  return value != null && typeof value === 'object';
}

function isFunction(value) {
  const tag = toString.call(value);
  return tag === funcTag || tag === genTag;
}

function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

function isArrayLikeObject(value) {
  return isObjectLike(value) && isArrayLike(value);
}

function isArguments(value) {
  return isArrayLikeObject(value)
    && hasOwnProp.call(value, 'callee')
    && (!propertyIsEnumerable.call(value, 'callee')
        || toString.call(value) === argsTag);
}

function isPrototype(value) {
  const Ctor = value && value.constructor;
  const proto = (typeof Ctor === 'function' && Ctor.prototype) || Object.prototype;
  return value === proto;
}

function baseTimes(n, iteratee) {
  const result = [];
  for (let i = 0; i < n; i++) {
    result.push(iteratee(i));
  }
  return result;
}

function isIndex(value, length) {
  if (length == null) {
    length = MAX_SAFE_INTEGER;
  }
  return !!length
    && (typeof value === 'number' || reIsUint.test(value))
    && (value > -1 && value % 1 === 0 && value < length);
}

function arrayLikeKeys(value) {
  // inherited is always falsy (undefined) when called from keys()
  const isArr = Array.isArray(value);
  const isArgs = !isArr && isArguments(value);

  // Step 1: dense index prefix for arrays and arguments only
  let result = (isArr || isArgs) ? baseTimes(value.length, String) : [];

  // Step 2
  const length = result.length;
  const skipIndexes = !!length;

  // Step 3: for-in append (own enumerable string keys not already in prefix)
  for (const key in value) {
    if (hasOwnProp.call(value, key)
        && !(skipIndexes && (key === 'length' || isIndex(key, length)))) {
      result.push(key);
    }
  }
  return result;
}

function baseKeys(object) {
  if (!isPrototype(object)) {
    return nativeKeys(object);
  }
  // object IS a prototype: hand-rolled loop dropping 'constructor'
  const result = [];
  for (const key in Object(object)) {
    if (hasOwnProp.call(object, key) && key !== 'constructor') {
      result.push(key);
    }
  }
  return result;
}

function keys(object) {
  return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
}

export default keys;
