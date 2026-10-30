// @rederive/defaultsDeep — verified-recompose of lodash.defaultsdeep@4.6.1. quorum 3/3, differential 400/400, round 1. SIR: sir/defaultsDeep.sir
// Clean-room reconstruction of lodash.defaultsdeep@4.6.1 — emitter #1
// Reconstructed purely from the SIR and frozen oracle. No original source consulted.

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

function isObject(v) {
  if (v == null) return false;
  const t = typeof v;
  return t === 'object' || t === 'function';
}

function isObjectLike(v) {
  return v != null && typeof v === 'object';
}

function isLength(v) {
  return typeof v === 'number' && v >= 0 && v % 1 === 0 && v <= 4294967295;
}

function isFunction(v) {
  return typeof v === 'function';
}

function isArrayLike(v) {
  return v != null && !isFunction(v) && isLength(v.length);
}

function isArrayLikeObject(v) {
  return isObjectLike(v) && isArrayLike(v);
}

function isPlainObject(v) {
  if (!isObjectLike(v) || Object.prototype.toString.call(v) !== '[object Object]') {
    return false;
  }
  const proto = Object.getPrototypeOf(v);
  if (proto === null) return true;
  const Ctor =
    Object.prototype.hasOwnProperty.call(proto, 'constructor') && proto.constructor;
  return (
    typeof Ctor === 'function' &&
    Ctor instanceof Ctor &&
    Function.prototype.toString.call(Ctor) === Function.prototype.toString.call(Object)
  );
}

function isArguments(v) {
  return isObjectLike(v) && Object.prototype.toString.call(v) === '[object Arguments]';
}

function isBuffer(v) {
  if (typeof Buffer !== 'undefined' && typeof Buffer.isBuffer === 'function') {
    return Buffer.isBuffer(v);
  }
  return false;
}

const typedArrayTags = new Set([
  '[object Float32Array]', '[object Float64Array]',
  '[object Int8Array]', '[object Int16Array]', '[object Int32Array]',
  '[object Uint8Array]', '[object Uint8ClampedArray]', '[object Uint16Array]',
  '[object Uint32Array]', '[object BigInt64Array]', '[object BigUint64Array]',
]);

function isTypedArray(v) {
  return isObjectLike(v) && typedArrayTags.has(Object.prototype.toString.call(v));
}

// SameValueZero: NaN === NaN, +0 === -0
function eq(a, b) {
  return a === b || (a !== a && b !== b);
}

// ---------------------------------------------------------------------------
// safeGet — guards __proto__ (always) and constructor (when function on dest)
// ---------------------------------------------------------------------------
function safeGet(obj, key) {
  if (key === '__proto__') return undefined;
  if (key === 'constructor' && typeof obj[key] === 'function') return undefined;
  return obj[key];
}

// ---------------------------------------------------------------------------
// assignMergeValue — the load-bearing leaf rule (SameValueZero-based)
//   assigns object[key] = value IFF:
//     (value !== undefined && !eq(object[key], value))
//   OR
//     (value === undefined && !(key in object))
// ---------------------------------------------------------------------------
function assignMergeValue(obj, key, value) {
  if (value !== undefined) {
    if (!eq(obj[key], value)) {
      obj[key] = value;
    }
  } else {
    // undefined value: only create the key if it is absent
    if (!(key in obj)) {
      obj[key] = undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// keysIn — enumerable own AND inherited string keys (for-in)
// ---------------------------------------------------------------------------
function keysIn(obj) {
  const keys = [];
  for (const key in obj) {
    keys.push(key);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// initCloneObject — fresh empty container matching srcValue's prototype
// Per lodash: if Ctor is a function and not Object itself, use Object.create(proto).
// For plain objects (Ctor === Object) just return {}.
// ---------------------------------------------------------------------------
function initCloneObject(obj) {
  if (typeof obj.constructor === 'function' && !isPlainObject(obj)) {
    return Object.create(Object.getPrototypeOf(obj));
  }
  return {};
}

function cloneBuffer(buf) {
  if (typeof buf.slice === 'function') return buf.slice(0);
  const copy = Buffer.allocUnsafe
    ? Buffer.allocUnsafe(buf.length)
    : Buffer.alloc(buf.length);
  buf.copy(copy);
  return copy;
}

function cloneTypedArray(ta) {
  return new ta.constructor(
    ta.buffer.slice(ta.byteOffset, ta.byteOffset + ta.byteLength)
  );
}

function toPlainObject(obj) {
  const result = {};
  for (const key in obj) {
    result[key] = obj[key];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Stack — circular reference tracker (Map-backed), matches lodash Stack API
// ---------------------------------------------------------------------------
class Stack {
  constructor() {
    this._map = new Map();
  }
  has(key) { return this._map.has(key); }
  get(key)  { return this._map.get(key); }
  set(key, value) { this._map.set(key, value); return this; }
  delete(key) { this._map.delete(key); }
}

// ---------------------------------------------------------------------------
// customDefaultsMerge — the customizer
// When both objValue and srcValue are objects: recurse baseMerge into objValue
// (fill gaps in the EXISTING dest container), then return objValue.
// Otherwise return objValue (the dest value, whatever it is — even undefined).
// ---------------------------------------------------------------------------
function customDefaultsMerge(objValue, srcValue, key, object, source, stack) {
  if (isObject(objValue) && isObject(srcValue)) {
    stack.set(srcValue, objValue);
    baseMerge(objValue, srcValue, customDefaultsMerge, stack);
    stack.delete(srcValue);
    // return objValue — customizer always returns dest
  }
  return objValue;
}

// ---------------------------------------------------------------------------
// baseMergeDeep — handles one key where srcValue isObject
// ---------------------------------------------------------------------------
function baseMergeDeep(object, source, key, customizer, stack) {
  const objValue = safeGet(object, key);
  const srcValue = safeGet(source, key);

  // Circular: already have a mapped counterpart for this srcValue
  if (stack.has(srcValue)) {
    assignMergeValue(object, key, stack.get(srcValue));
    return;
  }

  // Call the customizer
  let newValue = customizer
    ? customizer(objValue, srcValue, String(key), object, source, stack)
    : undefined;

  let isCommon = (newValue === undefined);

  if (isCommon) {
    // newValue is undefined means dest was not an object (or no customizer).
    // Determine what kind of container to build for srcValue.
    const srcIsArr    = Array.isArray(srcValue);
    const srcIsBuf    = !srcIsArr && isBuffer(srcValue);
    const srcIsTyped  = !srcIsArr && !srcIsBuf && isTypedArray(srcValue);
    const srcIsPlain  = !srcIsArr && !srcIsBuf && !srcIsTyped && isPlainObject(srcValue);
    const srcIsArgs   = !srcIsPlain && !srcIsArr && !srcIsBuf && !srcIsTyped && isArguments(srcValue);

    if (srcIsArr || srcIsBuf || srcIsTyped) {
      // Array / Buffer / TypedArray source
      if (srcIsArr) {
        if (Array.isArray(objValue)) {
          newValue = objValue;   // reuse existing array
        } else if (isArrayLikeObject(objValue)) {
          // e.g. a string wrapper — copy as array
          newValue = Array.from(objValue);
        } else {
          newValue = [];          // fresh array
        }
      } else if (srcIsBuf) {
        isCommon = false;
        newValue = cloneBuffer(srcValue);
      } else {
        // TypedArray
        isCommon = false;
        newValue = cloneTypedArray(srcValue);
      }
    } else if (srcIsPlain || srcIsArgs) {
      // Plain object / Arguments source
      if (isArguments(objValue)) {
        newValue = toPlainObject(objValue);
      } else if (!isObject(objValue) || isFunction(objValue)) {
        // objValue is absent / primitive / function -> fresh container
        newValue = initCloneObject(srcValue);
      } else {
        // objValue is a non-function object — reuse it (but we enter here only
        // when newValue===undefined, which means the customizer returned undefined,
        // which means objValue was NOT both-objects — so objValue might be an array,
        // a Date, etc. Use initCloneObject as the fresh destination.
        newValue = initCloneObject(srcValue);
      }
    } else {
      // Non-plain, non-array, non-buffer, non-typed-array source (Date, RegExp, Map, etc.)
      // Assign by REFERENCE, no clone, no recursion
      isCommon = false;
      newValue = srcValue;
    }

    if (isCommon) {
      stack.set(srcValue, newValue);
      baseMerge(newValue, srcValue, customizer, stack);
      stack.delete(srcValue);
    }
  }

  assignMergeValue(object, key, newValue);
}

// ---------------------------------------------------------------------------
// baseMerge — iterate keysIn(source) and merge each key into object
// ---------------------------------------------------------------------------
function baseMerge(object, source, customizer, stack) {
  if (object === source) return;

  const keys = keysIn(source);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    // Read srcValue for the branch decision (isObject check)
    // Use safeGet here to respect the __proto__ / constructor guard
    const srcValue = safeGet(source, key);

    if (isObject(srcValue)) {
      // Complex path — delegate to baseMergeDeep
      baseMergeDeep(object, source, key, customizer, stack);
    } else {
      // Scalar / null / undefined path
      // customDefaultsMerge returns objValue (the dest). If objValue is undefined
      // (key absent or present-undefined), newValue becomes srcValue.
      const objValue = safeGet(object, key);
      let newValue = customizer
        ? customizer(objValue, srcValue, String(key), object, source, stack)
        : undefined;
      if (newValue === undefined) {
        newValue = srcValue;
      }
      assignMergeValue(object, key, newValue);
    }
  }
}

// ---------------------------------------------------------------------------
// defaultsDeep — public API
// SIG: defaultsDeep(object, ...sources) -> object
// KIND STATE: mutates argument[0] in place, returns same reference.
// ---------------------------------------------------------------------------
export default function defaultsDeep(object, ...sources) {
  // Coerce first arg: Object(x). Primitives get boxed; null/undefined -> {}.
  object = Object(object);

  // Process sources left-to-right. Falsy sources are skipped (createAssigner guard).
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    if (source) {
      baseMerge(object, source, customDefaultsMerge, new Stack());
    }
  }

  return object;
}
