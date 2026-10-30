// @rederive/xor — verified-recompose of lodash.xor@4.5.0. quorum 3/3, differential 400/400, round 1. SIR: sir/xor.sir
// Clean-room re-emission of lodash.xor@4.5.0
// Reconstructed strictly from xor.sir + frozen oracle. No dependencies.

const MAX_SAFE_INTEGER = 9007199254740991; // 2^53 - 1

function isObjectLike(value) {
  // truthy AND typeof === 'object'
  // null: typeof null === 'object' but null is falsy -> false
  return value != null && typeof value === 'object';
}

function isLength(v) {
  // integer in [0, MAX_SAFE_INTEGER]
  return typeof v === 'number' && v > -1 && v % 1 === 0 && v <= MAX_SAFE_INTEGER;
}

function isFunction(v) {
  const tag = Object.prototype.toString.call(v);
  return tag === '[object Function]' || tag === '[object GeneratorFunction]';
}

function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

function isArrayLikeObject(value) {
  return isObjectLike(value) && isArrayLike(value);
}

// SameValueZero equality: NaN === NaN, +0 === -0
function sameValueZero(a, b) {
  // For NaN: a !== a && b !== b
  // For ±0: === handles it (0 === -0 is true in JS)
  return a === b || (a !== a && b !== b);
}

function valuesContains(values, computed) {
  // computed may be NaN or a normal value
  if (computed !== computed) {
    // NaN: search for any NaN in values
    for (let i = 0; i < values.length; i++) {
      if (values[i] !== values[i]) return true;
    }
    return false;
  }
  // non-NaN: use === (which treats -0 === +0 as true)
  for (let i = 0; i < values.length; i++) {
    if (values[i] === computed) return true;
  }
  return false;
}

function baseDifference(array, values) {
  const result = [];
  const len = array.length;
  if (len === 0) return result;

  for (let i = 0; i < len; i++) {
    const computed = array[i];
    // normalize -0 -> +0 in emitted element
    const value = (computed !== 0) ? computed : 0;
    if (!valuesContains(values, computed)) {
      result.push(value);
    }
  }
  return result;
}

function arrayPush(dst, src) {
  for (let i = 0; i < src.length; i++) {
    dst.push(src[i]);
  }
  return dst;
}

function baseUniq(array) {
  const out = [];
  for (let i = 0; i < array.length; i++) {
    const computed = array[i];
    // normalize -0 -> +0 in output
    const value = (computed !== 0) ? computed : 0;
    if (!valuesContains(out, computed)) {
      out.push(value);
    }
  }
  return out;
}

export default function xor(...arrays) {
  // STEP 1: filter to array-like objects
  const lists = [];
  for (let i = 0; i < arrays.length; i++) {
    if (isArrayLikeObject(arrays[i])) {
      lists.push(arrays[i]);
    }
  }

  // STEP 2: baseXor fold
  let result = undefined;
  for (let i = 0; i < lists.length; i++) {
    const cur = lists[i];
    if (result === undefined) {
      // first surviving list: taken as-is (not yet deduped)
      // We need to treat it as an array with numeric indices 0..length-1
      // Materialize it as a plain array for subsequent use
      result = Array.from({ length: cur.length }, (_, idx) => cur[idx]);
    } else {
      result = arrayPush(baseDifference(result, cur), baseDifference(cur, result));
    }
  }

  // STEP 3: baseUniq (or early return)
  if (result === undefined || result.length === 0) {
    return [];
  }

  return baseUniq(result);
}
