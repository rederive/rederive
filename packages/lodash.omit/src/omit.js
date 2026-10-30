// @rederive/omit — verified-recompose of lodash.omit@4.18.0. quorum 3/3, differential 400/400, round 1. SIR: sir/omit.sir
// Clean-room re-emission of lodash.omit@4.18.0 — emitter #3
// Reconstructed purely from the SIR behavioral contract and frozen oracle.
// Self-contained ES module; no imports.

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** isSymbol: typeof === 'symbol' or Object-wrapped Symbol */
function isSymbol(value) {
  const type = typeof value;
  return (
    type === 'symbol' ||
    (type === 'object' && value !== null && Object.prototype.toString.call(value) === '[object Symbol]')
  );
}

/** toKey: coerce a path segment to a string key. */
function toKey(value) {
  if (typeof value === 'string' || isSymbol(value)) return value;
  const result = String(value);
  // Handle -0
  if (result === '0' && (1 / value) === -Infinity) return '-0';
  return result;
}

// rePropName for stringToPath
const rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;

/** stringToPath: parse a dotted/bracket-notation path string into segment array. Memoized. */
const stringToPathCache = new Map();
function stringToPath(string) {
  if (stringToPathCache.has(string)) return stringToPathCache.get(string);
  const result = [];
  // If string starts with '.' push a leading '' segment
  if (string.charCodeAt(0) === 46 /* '.' */) {
    result.push('');
  }
  string.replace(rePropName, function(match, number, quote, subString) {
    result.push(
      quote
        ? subString.replace(/\\(\\)?/g, '$1') // unescape quoted bracket content
        : (number !== undefined ? number : match)
    );
  });
  if (stringToPathCache.size < 500) {
    stringToPathCache.set(string, result);
  }
  return result;
}

/** isKey: determine whether a value should be treated as a literal single-segment key. */
function isKey(value, object) {
  if (Array.isArray(value)) return false;
  const type = typeof value;
  if (
    type === 'number' ||
    type === 'symbol' ||
    type === 'boolean' ||
    value === null ||
    isSymbol(value)
  ) {
    return true;
  }
  // Must be string at this point
  const str = String(value);
  // Plain word (only \w chars)
  if (/^\w*$/.test(str)) return true;
  // No dot or bracket notation
  if (!/\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/.test(str)) return true;
  // Literal key exists in object
  if (object != null && str in Object(object)) return true;
  return false;
}

/** castPath: normalize a path value to an array of string segments. */
function castPath(value, object) {
  if (Array.isArray(value)) return value;
  if (isKey(value, object)) return [value];
  return stringToPath(String(value));
}

// ─── One-level flatten (baseFlatten depth 1) ─────────────────────────────────

/** Checks if value is Array or arguments object (flattening source for depth-1). */
function isArrayLike(value) {
  return Array.isArray(value) || isArguments(value);
}

function isArguments(value) {
  return (
    value != null &&
    typeof value === 'object' &&
    Object.prototype.toString.call(value) === '[object Arguments]'
  );
}

/** flatten: one level deep. Elements that are Array or arguments objects are spread. */
function flattenDepth1(array) {
  const result = [];
  for (let i = 0; i < array.length; i++) {
    const value = array[i];
    if (isArrayLike(value)) {
      for (let j = 0; j < value.length; j++) {
        result.push(value[j]);
      }
    } else {
      result.push(value);
    }
  }
  return result;
}

// ─── Key collection (getAllKeysIn) ────────────────────────────────────────────

/** keysIn: all enumerable string keys own + inherited via for..in. */
function keysIn(object) {
  const result = [];
  for (const key in object) {
    result.push(key);
  }
  return result;
}

/** getOwnSymbols: own enumerable symbol keys of an object (at one prototype level). */
function getOwnSymbols(object) {
  if (Object.getOwnPropertySymbols) {
    const syms = Object.getOwnPropertySymbols(object);
    return syms.filter(sym => Object.prototype.propertyIsEnumerable.call(object, sym));
  }
  return [];
}

/** getSymbolsIn: all enumerable symbol keys, own + inherited, walking prototype chain. */
function getSymbolsIn(object) {
  const result = [];
  let proto = object;
  while (proto !== null && proto !== undefined) {
    const syms = getOwnSymbols(Object(proto));
    for (const sym of syms) {
      result.push(sym);
    }
    proto = Object.getPrototypeOf(proto);
  }
  return result;
}

/** getAllKeysIn: string keys (keysIn) + symbol keys (getSymbolsIn). */
function getAllKeysIn(object) {
  const keys = keysIn(object);
  const syms = getSymbolsIn(object);
  return keys.concat(syms);
}

// ─── copyObject: write collected keys from source to target ──────────────────

function copyObject(source, keys, target) {
  for (const key of keys) {
    target[key] = source[key];
  }
  return target;
}

// ─── isPlainObject ────────────────────────────────────────────────────────────

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  // null-proto objects
  if (proto === null) return true;
  // Created by Object constructor (Object.prototype at the end of chain)
  const Ctor = Object.prototype.hasOwnProperty.call(proto, 'constructor') && proto.constructor;
  return (
    typeof Ctor === 'function' &&
    Ctor instanceof Ctor &&
    Function.prototype.toString.call(Ctor) === Function.prototype.toString.call(Object)
  );
}

// ─── Deep clone with customOmitClone ─────────────────────────────────────────
// CLONE_DEEP | CLONE_FLAT | CLONE_SYMBOLS:
//   - Deep: recursively clone plain-object values.
//   - Flat: copy inherited enumerable keys as own (getAllKeysIn -> own props on clone).
//   - Symbols: include symbol keys.
//   - customOmitClone(value): if NOT a plain object, return value AS-IS (no clone).
//     If IS a plain object, return undefined (proceed with normal clone).

function baseCloneWithOmitCustomizer(value, seen) {
  // customOmitClone short-circuit: non-plain objects returned as-is
  if (!isPlainObject(value)) {
    return value;
  }
  // Already seen? return cloned version (cycle detection)
  if (seen.has(value)) {
    return seen.get(value);
  }
  // Clone the plain object, including inherited enumerable keys (CLONE_FLAT)
  const clone = {};
  seen.set(value, clone);
  // CLONE_FLAT: use getAllKeysIn to pick up inherited enumerable string+symbol keys
  const keys = getAllKeysIn(value);
  for (const key of keys) {
    const childVal = value[key];
    clone[key] = baseCloneWithOmitCustomizer(childVal, seen);
  }
  return clone;
}

function deepCloneResult(result) {
  const seen = new Map();
  return baseCloneWithOmitCustomizer(result, seen);
}

// ─── baseGet: navigate path prefix to find parent container ──────────────────

function baseGet(object, path) {
  // path is an array of segments; navigate each
  let current = object;
  for (let i = 0; i < path.length; i++) {
    if (current == null) return undefined;
    current = current[toKey(path[i])];
  }
  return current;
}

// ─── baseUnset: delete a key in result navigating path ───────────────────────

function baseUnset(object, path) {
  if (path.length === 0) return true;

  // Prototype-pollution guards — check all segments
  for (let i = 0; i < path.length; i++) {
    const seg = toKey(path[i]);
    if (seg === '__proto__') {
      // Only allowed if object (root) has own '__proto__' data prop
      if (!Object.prototype.hasOwnProperty.call(object, '__proto__')) {
        return false;
      }
    }
    if (i < path.length - 1) {
      // Non-terminal segment: abort on constructor or prototype
      if (seg === 'constructor' || seg === 'prototype') {
        return false;
      }
    }
  }

  // Navigate to parent
  let parent;
  if (path.length < 2) {
    parent = object;
  } else {
    parent = baseGet(object, path.slice(0, path.length - 1));
  }

  if (parent == null) return true; // can't navigate, no-op

  const lastKey = toKey(path[path.length - 1]);
  delete parent[lastKey];
  return true;
}

// ─── Main omit function ───────────────────────────────────────────────────────

function omit(object, ...rest) {
  // STEP 0: one-level flatten of rest args
  let paths = flattenDepth1(rest);

  // STEP 1: nullish guard
  const result = {};
  if (object == null) return result;

  // STEP 2: normalize each path + detect deepness
  let isDeep = false;
  const normalizedPaths = [];
  for (let i = 0; i < paths.length; i++) {
    const normalized = castPath(paths[i], object);
    if (normalized.length > 1) isDeep = true;
    normalizedPaths.push(normalized);
  }

  // STEP 3: copy all enumerable keys (own + inherited, strings + symbols) into result
  copyObject(object, getAllKeysIn(object), result);

  // STEP 4: conditional deep clone
  let cloned = result;
  if (isDeep) {
    cloned = deepCloneResult(result);
  }

  // STEP 5: unset each path in REVERSE order
  let length = normalizedPaths.length;
  while (length--) {
    baseUnset(cloned, normalizedPaths[length]);
  }

  return cloned;
}

export default omit;
