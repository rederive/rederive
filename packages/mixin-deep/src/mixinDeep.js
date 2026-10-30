// @rederive/mixinDeep — verified-recompose of mixin-deep@2.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/mixinDeep.sir
// Clean-room reconstruction of mixin-deep@2.0.1 — emitter #1
// Implements the full behavioral contract from mixinDeep.sir

/**
 * isObject(val) -> boolean
 *
 * TRUE  for: plain objects, class instances, FUNCTIONS.
 * FALSE for: null, arrays, and all primitives (number, string, boolean, undefined, bigint, symbol).
 *
 * Arrays are explicitly NOT objects per the SIR — treated as opaque values (overwrite, never merged).
 */
function isObject(val) {
  return (
    typeof val === 'function' ||
    (typeof val === 'object' && val !== null && !Array.isArray(val))
  );
}

/**
 * isValidKey(key) -> boolean
 *
 * Prototype-pollution guard: skip __proto__, constructor, and prototype at every nesting level.
 */
function isValidKey(key) {
  return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

/**
 * mixin(target, val, key)
 *
 * Applies one key-value pair from a source into the target.
 * - If BOTH target[key] and val are isObject: recurse-merge (deep).
 * - Otherwise: overwrite (assign by reference, no clone).
 */
function mixin(target, val, key) {
  const obj = target[key];
  if (isObject(val) && isObject(obj)) {
    // Both sides are objects -> recurse and merge val's enumerable keys into obj in place.
    mixinDeep(obj, val);
  } else {
    // At least one side is NOT an object (primitive, null, array) -> overwrite.
    target[key] = val;
  }
}

/**
 * mixinDeep(target, ...rest) -> target
 *
 * Deep-merges each source in rest (left-to-right, last-wins) into target.
 * Mutates target in place and returns the same object reference.
 *
 * - Non-object sources (null, arrays, primitives) are skipped entirely.
 * - Object sources are enumerated with for...in (own + inherited enumerable string keys).
 * - Prototype-pollution guard applied at every nesting level.
 * - Returns target (identity: ret === target always).
 */
export default function mixinDeep(target, ...rest) {
  for (const obj of rest) {
    if (!isObject(obj)) {
      // source is null, an array, or a primitive -> skip
      continue;
    }
    for (const key in obj) {
      if (!isValidKey(key)) {
        // __proto__ / constructor / prototype -> skip
        continue;
      }
      mixin(target, obj[key], key);
    }
  }
  return target;
}
