// @rederive/toPairs — verified-recompose of lodash.topairs@4.3.0. quorum 3/3, differential 400/400, round 1. SIR: sir/toPairs.sir
const MAX_SAFE_INTEGER = 9007199254740991;
const reIsUint = /^(?:0|[1-9]\d*)$/;

function isLength(value) {
  return typeof value === 'number' &&
    value > -1 &&
    value % 1 === 0 &&
    value <= MAX_SAFE_INTEGER;
}

function isIndex(value, length) {
  const type = typeof value;
  if (type === 'number') {
    return value > -1 && value % 1 === 0 && value < length;
  }
  if (type === 'string') {
    if (!reIsUint.test(value)) return false;
    const n = +value;
    return n > -1 && n % 1 === 0 && n < length;
  }
  return false;
}

function getTag(value) {
  return Object.prototype.toString.call(value);
}

function isFunction(value) {
  const tag = getTag(value);
  return tag === '[object Function]' || tag === '[object GeneratorFunction]';
}

function isArrayLike(value) {
  if (value == null) return false;
  if (isFunction(value)) return false;
  return isLength(value.length);
}

function isArguments(value) {
  return getTag(value) === '[object Arguments]';
}

function isPrototype(value) {
  const Ctor = value && value.constructor;
  const proto = (typeof Ctor === 'function' && Ctor.prototype) || Object.prototype;
  return value === proto;
}

function arrayLikeKeys(value) {
  const isArr = Array.isArray(value);
  const isArgs = !isArr && isArguments(value);
  const skipIndexes = isArr || isArgs;

  let result = [];

  if (skipIndexes) {
    const len = value.length;
    for (let i = 0; i < len; i++) {
      result.push(String(i));
    }
  }

  // for-in to pick up own enumerable keys (including for strings, typed arrays, etc.)
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    if (skipIndexes) {
      if (key === 'length') continue;
      if (isIndex(key, result.length)) continue;
    }
    result.push(key);
  }

  return result;
}

function baseKeys(object) {
  if (isPrototype(object)) {
    const result = [];
    for (const key in object) {
      if (key !== 'constructor' && Object.prototype.hasOwnProperty.call(object, key)) {
        result.push(key);
      }
    }
    return result;
  }
  return Object.keys(Object(object));
}

function keys(object) {
  if (isArrayLike(object)) {
    return arrayLikeKeys(object);
  }
  return baseKeys(object);
}

function toPairs(object) {
  const tag = getTag(object);

  // BRANCH-1: Map
  if (tag === '[object Map]') {
    const result = [];
    object.forEach((value, key) => {
      result.push([key, value]);
    });
    return result;
  }

  // BRANCH-2: Set
  if (tag === '[object Set]') {
    const result = [];
    object.forEach((value) => {
      result.push([value, value]);
    });
    return result;
  }

  // BRANCH-3: everything else
  const K = keys(object);
  return K.map(k => [k, object[k]]);
}

export default toPairs;
