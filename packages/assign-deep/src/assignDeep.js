// @rederive/assignDeep — verified-recompose of assign-deep@1.0.1. quorum 2/3, differential 400/400, round 2. SIR: sir/assignDeep.sir
'use strict';

// ── Helpers (exact predicates from the SIR) ──────────────────────────────────

const _toString = Object.prototype.toString;

// assign-deep's own isObject: plain objects + functions; NOT arrays.
function isObject(val) {
  return typeof val === 'function' ||
         _toString.call(val) === '[object Object]';
}

// assign-symbols' isObject: plain objects + functions + arrays.
function isObjectAS(val) {
  return typeof val === 'function' ||
         _toString.call(val) === '[object Object]' ||
         Array.isArray(val);
}

// isPrimitive: null, undefined, numbers, strings, booleans, bigints, symbols.
// Non-null objects (including arrays) and functions are NOT primitive.
function isPrimitive(val) {
  return (typeof val === 'object') ? (val === null) : (typeof val !== 'function');
}

// isValidKey: skip prototype-pollution class keys.
function isValidKey(key) {
  return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

// ── Core ─────────────────────────────────────────────────────────────────────

function assignDeep(target, ...args) {
  // [N1] i := 0
  let i = 0;

  // [N2] TARGET-PRIMITIVE FIXUP
  if (isPrimitive(target)) {
    target = args[i];
    i = i + 1;
  }

  // [N3] FALSY-TARGET FIXUP
  if (!target) {
    target = {};
  }

  // [N4] MERGE LOOP
  for (; i < args.length; i++) {
    const src = args[i];

    // [N4.1] Skip non-object sources entirely.
    if (!isObject(src)) {
      continue;
    }

    // [N4.2] KEY-COPY
    const keys = Object.keys(src);
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];

      // Skip prototype-pollution keys.
      if (!isValidKey(key)) {
        continue;
      }

      if (isObject(target[key]) && isObject(src[key])) {
        // Both sides are plain-object-or-function => recurse (deep merge).
        assignDeep(target[key], src[key]);
      } else {
        // Overwrite by reference — LAZY THROW-A site:
        // If `target` is a truthy primitive, this write in strict mode causes
        // V8 to throw "Cannot create property '<key>' on <type> '<value>'".
        // We perform the actual write so the engine generates the exact message.
        target[key] = src[key];
      }
    }

    // [N4.3] EAGER GUARD (inlined from assign-symbols):
    // Runs once per object source, AFTER the key-copy loop.
    // If target is a truthy primitive (not a function, not an array, not an
    // object) this throws the literal assign-symbols message.
    if (!isObjectAS(target)) {
      throw new TypeError('expected the first argument to be an object');
    }
    // The Symbol-copy that follows in assign-symbols is OUT-OF-CONTRACT; omitted.
  }

  // [N5] Return the mutated target reference.
  return target;
}

export { assignDeep };
export default assignDeep;
