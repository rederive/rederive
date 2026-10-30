// @rederive/merge — verified-recompose of lodash.merge@4.6.2. quorum 3/3, differential 400/400, round 1. SIR: sir/merge.sir
// Clean-room re-emission of lodash.merge@4.6.2 behavior from SIR contract.
// No external dependencies. ES module default export.

const toString = Object.prototype.toString;
const hasOwnProperty = Object.prototype.hasOwnProperty;

function isObject(value) {
  const type = typeof value;
  return value != null && (type === 'object' || type === 'function');
}

function isFunction(value) {
  return typeof value === 'function';
}

function isArray(value) {
  return Array.isArray(value);
}

function isPlainObject(value) {
  if (toString.call(value) !== '[object Object]') return false;
  const proto = Object.getPrototypeOf(value);
  if (proto === null) return true;
  const Ctor = hasOwnProperty.call(proto, 'constructor') && proto.constructor;
  return typeof Ctor === 'function' && Ctor instanceof Ctor &&
    Function.prototype.toString.call(Ctor) === Function.prototype.toString.call(Object);
}

function isArguments(value) {
  return toString.call(value) === '[object Arguments]';
}

function isBuffer(value) {
  return value != null && typeof value === 'object' &&
    typeof Buffer !== 'undefined' && Buffer.isBuffer(value);
}

const typedArrayTags = new Set([
  '[object Float32Array]', '[object Float64Array]',
  '[object Int8Array]',    '[object Int16Array]',   '[object Int32Array]',
  '[object Uint8Array]',   '[object Uint16Array]',  '[object Uint32Array]',
  '[object Uint8ClampedArray]', '[object BigInt64Array]', '[object BigUint64Array]',
]);

function isTypedArray(value) {
  return value != null && typedArrayTags.has(toString.call(value));
}

function isArrayLikeObject(value) {
  return isObject(value) && typeof value.length === 'number' &&
    Number.isInteger(value.length) && value.length >= 0;
}

// keysIn: own + inherited enumerable string keys, excluding inherited/non-own 'constructor'
function keysIn(object) {
  const keys = [];
  for (const key in Object(object)) {
    // Exclude 'constructor' if it is not own but is on the prototype
    if (key === 'constructor') {
      if (hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
      // If constructor is inherited-and-not-own, skip it
      continue;
    }
    keys.push(key);
  }
  return keys;
}

function safeGet(object, key) {
  if (key === '__proto__') {
    return undefined;
  }
  if (key === 'constructor' && typeof object[key] === 'function') {
    return undefined;
  }
  return object[key];
}

// SameValueZero equality
function eq(value, other) {
  return value === other || (value !== value && other !== other);
}

function assignMergeValue(object, key, value) {
  if (value !== undefined && !eq(object[key], value)) {
    baseAssignValue(object, key, value);
  } else if (value === undefined && !(key in object)) {
    baseAssignValue(object, key, value);
  }
}

function baseAssignValue(object, key, value) {
  if (key === '__proto__' && Object.defineProperty) {
    Object.defineProperty(object, '__proto__', {
      configurable: true,
      enumerable: true,
      value: value,
      writable: true,
    });
  } else {
    object[key] = value;
  }
}

function cloneBuffer(buf, isDeep) {
  // Deep clone a Node Buffer
  const result = Buffer.allocUnsafe ? Buffer.allocUnsafe(buf.length) : new Buffer(buf.length);
  buf.copy(result);
  return result;
}

function cloneTypedArray(typedArray, isDeep) {
  const Ctor = typedArray.constructor;
  return new Ctor(typedArray.buffer.slice(0), typedArray.byteOffset, typedArray.length);
}

function copyArray(source) {
  // Shallow copy into a plain Array
  const length = source.length;
  const result = new Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = source[i];
  }
  return result;
}

function initCloneObject(object) {
  // Create a fresh object with the same prototype
  const proto = Object.getPrototypeOf(object);
  if (proto === null) {
    return Object.create(null);
  }
  return Object.create(proto);
}

function toPlainObject(value) {
  // Convert arguments object to plain object
  const result = {};
  for (const key in value) {
    result[key] = value[key];
  }
  return result;
}

// Simple Stack using Map for cycle tracking
class Stack {
  constructor() {
    this._map = new Map();
  }
  get(key) {
    return this._map.get(key);
  }
  set(key, value) {
    this._map.set(key, value);
    return this;
  }
  delete(key) {
    this._map.delete(key);
  }
}

function baseMergeDeep(object, source, key, srcIndex, mergeFunc, stack) {
  const objValue = safeGet(object, key);
  const srcValue = safeGet(source, key);

  // Cycle check
  const stacked = stack.get(srcValue);
  if (stacked !== undefined) {
    assignMergeValue(object, key, stacked);
    return;
  }

  let newValue = undefined; // no customizer
  let isCommon = true;      // newValue === undefined => isCommon = true

  if (isCommon) {
    const isArr = isArray(srcValue);
    const isBuff = !isArr && isBuffer(srcValue);
    const isTyped = !isArr && !isBuff && isTypedArray(srcValue);

    newValue = srcValue;

    if (isArr || isBuff || isTyped) {
      if (isArray(objValue)) {
        newValue = objValue; // keep dest array; recurse index-wise
      } else if (isArrayLikeObject(objValue)) {
        newValue = copyArray(objValue); // copy into plain array
      } else if (isBuff) {
        isCommon = false;
        newValue = cloneBuffer(srcValue, true); // deep clone Buffer; NO recurse
      } else if (isTyped) {
        isCommon = false;
        newValue = cloneTypedArray(srcValue, true); // deep clone typed array; NO recurse
      } else {
        newValue = []; // fresh empty array; recurse
      }
    } else if (isPlainObject(srcValue) || isArguments(srcValue)) {
      newValue = objValue;
      if (isArguments(objValue)) {
        newValue = toPlainObject(objValue);
      } else if (!isObject(objValue) || isFunction(objValue)) {
        newValue = initCloneObject(srcValue);
      }
      // else: dest already an object -> merge INTO it in place
    } else {
      // Foreign object (Date, RegExp, Map, Set, Error, class instance, etc.)
      isCommon = false;
      newValue = srcValue; // assign by reference
    }
  }

  if (isCommon) {
    stack.set(srcValue, newValue);
    mergeFunc(newValue, srcValue, srcIndex, undefined, stack);
    stack.delete(srcValue);
  }

  assignMergeValue(object, key, newValue);
}

function baseMerge(object, source, srcIndex, customizer, stack) {
  if (object === source) return;

  // Lazily allocate stack
  if (stack === undefined) {
    stack = new Stack();
  }

  const keys = keysIn(source);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const srcValue = source[key];

    if (isObject(srcValue)) {
      baseMergeDeep(object, source, key, srcIndex, baseMerge, stack);
    } else {
      // primitive (including null, undefined, bigint, NaN)
      const newValue = srcValue;
      assignMergeValue(object, key, newValue);
    }
  }
}

function merge(object, ...sources) {
  object = Object(object);

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    if (source) {
      // truthy sources only
      baseMerge(object, source, i);
    }
  }

  return object;
}

export default merge;
