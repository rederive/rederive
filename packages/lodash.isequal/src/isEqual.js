// @rederive/isEqual — verified-recompose of lodash.isequal@4.5.0. quorum 3/3, differential 400/400, round 1. SIR: sir/isEqual.sir
// Clean-room re-emission of lodash.isequal@4.5.0 isEqual
// Reconstructed from SIR + frozen oracle. Zero deps, pure JS .mjs.

// ─── helpers ──────────────────────────────────────────────────────────────────

// SameValueZero leaf (NaN==NaN, +0===−0 treated equal)
function eq(a, b) {
  return a === b || (a !== a && b !== b);
}

// isObjectLike: non-null && typeof 'object'
function isObjectLike(value) {
  return value != null && typeof value === 'object';
}

// isObject: non-null && (object or function)
// (used only implicitly; kept for clarity)
// function isObject(value) {
//   return value != null && (typeof value === 'object' || typeof value === 'function');
// }

// getTag: Object.prototype.toString with null/undefined overrides
const objectProto = Object.prototype;
const nativeObjectToString = objectProto.toString;

function getTag(value) {
  if (value == null) {
    return value === undefined ? '[object Undefined]' : '[object Null]';
  }
  return nativeObjectToString.call(value);
}

// Typed-array tag set
const typedArrayTags = new Set([
  '[object Float32Array]',
  '[object Float64Array]',
  '[object Int8Array]',
  '[object Int16Array]',
  '[object Int32Array]',
  '[object Uint8Array]',
  '[object Uint8ClampedArray]',
  '[object Uint16Array]',
  '[object Uint32Array]',
]);

function isTypedArray(value) {
  return isObjectLike(value) && typedArrayTags.has(getTag(value));
}

// isBuffer: use Node's Buffer.isBuffer when available, else always false
const isBuffer = (typeof Buffer !== 'undefined' && typeof Buffer.isBuffer === 'function')
  ? Buffer.isBuffer
  : function() { return false; };

// Map/Set converters
function mapToArray(map) {
  let index = -1;
  const result = new Array(map.size);
  map.forEach(function(value, key) {
    result[++index] = [key, value];
  });
  return result;
}

function setToArray(set) {
  let index = -1;
  const result = new Array(set.size);
  set.forEach(function(value) {
    result[++index] = value;
  });
  return result;
}

// getAllKeys: own enumerable string keys + own enumerable symbol keys
function getAllKeys(object) {
  const keys = Object.keys(object);
  if (typeof Object.getOwnPropertySymbols === 'function') {
    const symbols = Object.getOwnPropertySymbols(object);
    for (let i = 0; i < symbols.length; i++) {
      if (objectProto.propertyIsEnumerable.call(object, symbols[i])) {
        keys.push(symbols[i]);
      }
    }
  }
  return keys;
}

// Stack: a simple Map used to track object pairs for cyclic detection
// We use a plain Map: stack.get(object) => other
function Stack() {
  this.__data__ = new Map();
}
Stack.prototype.get = function(key) {
  return this.__data__.get(key);
};
Stack.prototype.set = function(key, value) {
  this.__data__.set(key, value);
  return this;
};
Stack.prototype.delete = function(key) {
  this.__data__.delete(key);
  return this;
};

// SetCache: for unordered (Map/Set) element matching
// tracks which indices of `other` array have been "consumed"
// In lodash the SetCache is used to mark already-matched indices.
// We implement it as a Set of values that have been matched.
// Actually re-reading SIR NODE 3: it tracks othIndex values that have been seen.
// "find some othIndex not yet in `seen`" — seen stores othIndex values.
// We'll implement SetCache as a simple array-based tracker.
function SetCache() {
  this.__data__ = [];
}
SetCache.prototype.push = function(value) {
  this.__data__.push(value);
};
SetCache.prototype.has = function(value) {
  return this.__data__.indexOf(value) !== -1;
};

// ─── bitmask flags ────────────────────────────────────────────────────────────
const PARTIAL_COMPARE_FLAG = 1;
const UNORDERED_COMPARE_FLAG = 2;

// ─── NODE 3: equalArrays ──────────────────────────────────────────────────────
function equalArrays(array, other, bitmask, customizer, equalFunc, stack) {
  const isPartial = bitmask & PARTIAL_COMPARE_FLAG;
  const arrLength = array.length;
  const othLength = other.length;

  if (arrLength !== othLength && !(isPartial && othLength > arrLength)) {
    return false;
  }

  // cyclic guard
  const stacked = stack.get(array);
  if (stacked && stack.get(other)) {
    return stacked === other;
  }

  const isUnordered = bitmask & UNORDERED_COMPARE_FLAG;
  const seen = isUnordered ? new SetCache() : undefined;

  stack.set(array, other);
  stack.set(other, array);

  let result = true;
  let index = -1;

  while (++index < arrLength) {
    const arrValue = array[index];
    const othValue = other[index];

    if (isUnordered) {
      // find an unmatched entry in other that equals arrValue
      let othIndex = othLength;
      let found = false;
      while (othIndex--) {
        if (!seen.has(othIndex)) {
          const othVal = other[othIndex];
          if (arrValue === othVal || equalFunc(arrValue, othVal, bitmask, customizer, stack)) {
            seen.push(othIndex);
            found = true;
            break;
          }
        }
      }
      if (!found) {
        result = false;
        break;
      }
    } else {
      // ordered comparison
      if (!(arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
        result = false;
        break;
      }
    }
  }

  stack.delete(array);
  stack.delete(other);
  return result;
}

// ─── NODE 2: equalByTag ───────────────────────────────────────────────────────
const symbolValueOf = Symbol.prototype.valueOf;

function equalByTag(object, other, tag, bitmask, customizer, equalFunc, stack) {
  switch (tag) {
    case '[object DataView]': {
      if (object.byteLength !== other.byteLength || object.byteOffset !== other.byteOffset) {
        return false;
      }
      // fall through to ArrayBuffer comparison using the underlying buffers
      object = object.buffer;
      other = other.buffer;
      // FALL THROUGH
    }
    // eslint-disable-next-line no-fallthrough
    case '[object ArrayBuffer]': {
      if (object.byteLength !== other.byteLength ||
          !equalFunc(new Uint8Array(object), new Uint8Array(other), bitmask, customizer, stack)) {
        return false;
      }
      return true;
    }

    case '[object Boolean]':
    case '[object Date]':
    case '[object Number]':
      return eq(+object, +other);

    case '[object Error]':
      return object.name === other.name && object.message === other.message;

    case '[object RegExp]':
    case '[object String]':
      return object == (other + '');

    case '[object Map]': {
      // convert Map to array of [key, value] pairs, then fall through to Set logic
      // We handle Map inline here (SIR says "FALL THROUGH to Set case")
      const mapConvert = mapToArray;
      const isPartial = bitmask & PARTIAL_COMPARE_FLAG;
      if (object.size !== other.size && !isPartial) {
        return false;
      }
      const mapStacked = stack.get(object);
      if (mapStacked) {
        return mapStacked === other;
      }
      const mapBitmask = bitmask | UNORDERED_COMPARE_FLAG;
      stack.set(object, other);
      const mapResult = equalArrays(mapConvert(object), mapConvert(other), mapBitmask, customizer, equalFunc, stack);
      stack.delete(object);
      return mapResult;
    }

    case '[object Set]': {
      const setConvert = setToArray;
      const isPartial = bitmask & PARTIAL_COMPARE_FLAG;
      if (object.size !== other.size && !isPartial) {
        return false;
      }
      const setStacked = stack.get(object);
      if (setStacked) {
        return setStacked === other;
      }
      const setBitmask = bitmask | UNORDERED_COMPARE_FLAG;
      stack.set(object, other);
      const setResult = equalArrays(setConvert(object), setConvert(other), setBitmask, customizer, equalFunc, stack);
      stack.delete(object);
      return setResult;
    }

    case '[object Symbol]':
      return (typeof symbolValueOf === 'function')
        ? symbolValueOf.call(object) === symbolValueOf.call(other)
        : false;

    default:
      return false;
  }
}

// ─── NODE 4: equalObjects ─────────────────────────────────────────────────────
const hasOwnProp = objectProto.hasOwnProperty;

function equalObjects(object, other, bitmask, customizer, equalFunc, stack) {
  const isPartial = bitmask & PARTIAL_COMPARE_FLAG;
  const objProps = getAllKeys(object);
  const othProps = getAllKeys(other);
  const objLength = objProps.length;
  const othLength = othProps.length;

  if (objLength !== othLength && !isPartial) {
    return false;
  }

  // key-presence check
  let index = objLength;
  while (index--) {
    const key = objProps[index];
    if (isPartial ? !(key in other) : !hasOwnProp.call(other, key)) {
      return false;
    }
  }

  // cyclic guard
  const stacked = stack.get(object);
  if (stacked && stack.get(other)) {
    return stacked === other;
  }

  stack.set(object, other);
  stack.set(other, object);

  let result = true;
  let skipCtor = false;

  index = -1;
  while (++index < objLength) {
    const key = objProps[index];
    const objValue = object[key];
    const othValue = other[key];

    if (!(objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack))) {
      result = false;
      break;
    }
    if (!skipCtor) {
      skipCtor = (key === 'constructor');
    }
  }

  // constructor check
  if (result && !skipCtor) {
    const objCtor = object.constructor;
    const othCtor = other.constructor;
    if (objCtor !== othCtor &&
        ('constructor' in object && 'constructor' in other) &&
        !(typeof objCtor === 'function' && objCtor instanceof objCtor &&
          typeof othCtor === 'function' && othCtor instanceof othCtor)) {
      result = false;
    }
  }

  stack.delete(object);
  stack.delete(other);
  return result;
}

// ─── NODE 1: baseIsEqualDeep ──────────────────────────────────────────────────
const ARRAY_TAG     = '[object Array]';
const OBJECT_TAG    = '[object Object]';
const ARGS_TAG      = '[object Arguments]';

function baseIsEqualDeep(object, other, bitmask, customizer, equalFunc, stack) {
  let objIsArr = Array.isArray(object);
  let othIsArr = Array.isArray(other);
  let objTag = objIsArr ? ARRAY_TAG : getTag(object);
  let othTag = othIsArr ? ARRAY_TAG : getTag(other);

  // collapse arguments to object
  if (objTag === ARGS_TAG) objTag = OBJECT_TAG;
  if (othTag === ARGS_TAG) othTag = OBJECT_TAG;

  let objIsObj = (objTag === OBJECT_TAG);
  const othIsObj = (othTag === OBJECT_TAG);
  const isSameTag = (objTag === othTag);

  // BRANCH 1a: Buffer guard
  if (isSameTag && isBuffer(object)) {
    if (!isBuffer(other)) {
      return false;
    }
    objIsArr = true;
    objIsObj = false;
  }

  // BRANCH 1b: non-plain same-tag => array-like or by-tag
  if (isSameTag && !objIsObj) {
    stack = stack || new Stack();
    if (objIsArr || isTypedArray(object)) {
      return equalArrays(object, other, bitmask, customizer, equalFunc, stack);
    } else {
      return equalByTag(object, other, objTag, bitmask, customizer, equalFunc, stack);
    }
  }

  // BRANCH 1c: lodash wrapper unwrap (bitmask & PARTIAL == 0 here, so block runs,
  // but __wrapped__ is never present on plain objects — effectively inert)
  if (!(bitmask & PARTIAL_COMPARE_FLAG)) {
    const objIsWrapped = objIsObj && hasOwnProp.call(object, '__wrapped__');
    const othIsWrapped = othIsObj && hasOwnProp.call(other, '__wrapped__');
    if (objIsWrapped || othIsWrapped) {
      const objUnwrapped = objIsWrapped ? object.value() : object;
      const othUnwrapped = othIsWrapped ? other.value() : other;
      stack = stack || new Stack();
      return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
    }
  }

  // BRANCH 1d: tag mismatch
  if (!isSameTag) {
    return false;
  }

  // BRANCH 1e: plain object path
  stack = stack || new Stack();
  return equalObjects(object, other, bitmask, customizer, equalFunc, stack);
}

// ─── NODE 0: baseIsEqual (the public entry) ───────────────────────────────────
function baseIsEqual(value, other) {
  // BRANCH 0a: strict equality (covers +0===-0)
  if (value === other) {
    return true;
  }
  // BRANCH 0b: null/undefined/non-object-like primitives
  if (value == null || other == null ||
      (!isObjectLike(value) && !isObjectLike(other))) {
    // true only if both are NaN
    return value !== value && other !== other;
  }
  // BRANCH 0c: deep comparison
  return baseIsEqualDeep(value, other, 0, undefined, baseIsEqual, undefined);
}

// ─── public export ────────────────────────────────────────────────────────────
export default baseIsEqual;
