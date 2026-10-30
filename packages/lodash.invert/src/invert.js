// @rederive/invert — verified-recompose of lodash.invert@4.3.0. quorum 3/3, differential 400/400, round 2. SIR: sir/invert.sir
// Clean-room re-emission of lodash.invert@4.3.0
// Reconstructed strictly from the SIR contract.

const MAX_SAFE_INTEGER = 9007199254740991;
const reIsUint = /^(?:0|[1-9]\d*)$/;

function isLength(value) {
  return typeof value === 'number' &&
    value > -1 &&
    value % 1 === 0 &&
    value <= MAX_SAFE_INTEGER;
}

function isFunction(value) {
  const tag = Object.prototype.toString.call(value);
  return tag === '[object Function]' || tag === '[object GeneratorFunction]';
}

function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

function isArray(value) {
  return Array.isArray(value);
}

function isArguments(value) {
  return Object.prototype.toString.call(value) === '[object Arguments]';
}

function isIndex(value, length) {
  const len = length == null ? MAX_SAFE_INTEGER : length;
  return !!len &&
    (typeof value === 'number' || reIsUint.test(value)) &&
    value > -1 &&
    value % 1 === 0 &&
    value < len;
}

function baseTimes(n, iteratee) {
  const result = [];
  for (let i = 0; i < n; i++) {
    result.push(iteratee(i));
  }
  return result;
}

function arrayLikeKeys(value) {
  // inherited is undefined (falsy) => own only
  const isArr = isArray(value) || isArguments(value);
  const result = isArr ? baseTimes(value.length, String) : [];
  const length = result.length;
  const skipIndexes = !!length;

  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key) &&
        !(skipIndexes && (key === 'length' || isIndex(key, length)))) {
      result.push(key);
    }
  }
  return result;
}

function isPrototype(value) {
  const Ctor = value && value.constructor;
  const proto = (typeof Ctor === 'function' && Ctor.prototype) || Object.prototype;
  return value === proto;
}

function baseKeys(object) {
  if (!isPrototype(object)) {
    return Object.keys(object);
  }
  // prototype object special case: own enumerable keys except "constructor"
  const result = [];
  for (const key in Object(object)) {
    if (Object.prototype.hasOwnProperty.call(object, key) && key !== 'constructor') {
      result.push(key);
    }
  }
  return result;
}

function keys(object) {
  return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
}

function invert(object) {
  // NODE 1: falsy guard — baseForOwn does `object && baseFor(...)`
  if (!object) {
    return {};
  }

  const result = {};
  const props = keys(object);

  // NODE 3: left-to-right iteration (baseFor)
  for (let i = 0; i < props.length; i++) {
    const key = props[i];
    const value = object[key];
    // NODE 4: setter — result[value] = key (native ToPropertyKey coercion, last-wins)
    result[value] = key;
  }

  // NODE 5: return fresh accumulator
  return result;
}

export default invert;
