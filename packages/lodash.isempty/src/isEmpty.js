// @rederive/isEmpty — verified-recompose of lodash.isempty@4.4.0. quorum 3/3, differential 400/400, round 2. SIR: sir/isEmpty.sir
// Clean-room reconstruction of lodash.isempty@4.4.0 isEmpty
// Reconstructed from SIR contract; ES module default export.

// Runtime-constant preconditions (pinned to modern V8 / Node >= ~6):
//   nonEnumShadows == false
//   getTag(v) == Object.prototype.toString.call(v)

const MAX_SAFE_INTEGER = 9007199254740991;
const hasOwnProperty = Object.prototype.hasOwnProperty;
const propertyIsEnumerable = Object.prototype.propertyIsEnumerable;
const toString = Object.prototype.toString;

const mapTag = '[object Map]';
const setTag = '[object Set]';

// nonEnumShadows is pinned to false on modern V8
const nonEnumShadows = false;

function isLength(v) {
  return typeof v === 'number' && v > -1 && v % 1 === 0 && v <= MAX_SAFE_INTEGER;
}

function isObject(v) {
  return !!v && (typeof v === 'object' || typeof v === 'function');
}

function isFunction(v) {
  var tag = isObject(v) ? toString.call(v) : '';
  return tag === '[object Function]' || tag === '[object GeneratorFunction]';
}

function isArrayLike(v) {
  return v != null && isLength(v.length) && !isFunction(v);
}

function isObjectLike(v) {
  return !!v && typeof v === 'object';
}

function isArray(v) {
  return Array.isArray(v);
}

function isBuffer(v) {
  // Node Buffer.isBuffer when global Buffer exists, else const-false
  return typeof Buffer !== 'undefined' && Buffer.isBuffer(v);
}

function isArguments(v) {
  // isArrayLikeObject(v) && hasOwnProperty.call(v, 'callee') &&
  //   (!propertyIsEnumerable.call(v, 'callee') ||
  //    Object.prototype.toString.call(v) == '[object Arguments]')
  return isObjectLike(v) && isArrayLike(v) &&
    hasOwnProperty.call(v, 'callee') &&
    (!propertyIsEnumerable.call(v, 'callee') ||
      toString.call(v) === '[object Arguments]');
}

function isPrototype(v) {
  var Ctor = v && v.constructor;
  var proto = (typeof Ctor === 'function' && Ctor.prototype) || Object.prototype;
  return v === proto;
}

function nativeKeys(v) {
  return Object.keys(v);
}

function getTag(v) {
  // On modern V8, getTag is exactly Object.prototype.toString.call (no legacy fallback)
  return toString.call(v);
}

function isEmpty(value) {
  // RUNG 1 — array-like collection branch
  if (isArrayLike(value) &&
      (isArray(value) ||
       typeof value === 'string' ||
       typeof value.splice === 'function' ||
       isBuffer(value) ||
       isArguments(value))) {
    return !value.length;
  }

  // RUNG 2 — Map / Set tag branch
  var tag = getTag(value);
  if (tag === mapTag || tag === setTag) {
    return !value.size;
  }

  // RUNG 3 — prototype-object sub-branch
  // nonEnumShadows is false (pinned), so only fires when isPrototype(value)
  if (nonEnumShadows || isPrototype(value)) {
    return !nativeKeys(value).length;
  }

  // RUNG 4 — for-in / hasOwnProperty fallback
  for (var key in value) {
    if (hasOwnProperty.call(value, key)) {
      return false;
    }
  }
  return true;
}

export default isEmpty;
