// @rederive/union — verified-recompose of lodash.union@4.6.0. quorum 3/3, differential 400/400, round 1. SIR: sir/union.sir
// Clean-room re-emission of lodash.union@4.6.0
// Implements the full behavioral contract from the SIR, zero external deps.

const MAX_SAFE_INTEGER = 9007199254740991;

function isLength(n) {
  return typeof n === 'number' && n > -1 && n % 1 === 0 && n <= MAX_SAFE_INTEGER;
}

function isObjectLike(a) {
  // truthy AND typeof === 'object'
  // Note: typeof null === 'object' but null is falsy, so `a != null` handles it.
  return a != null && typeof a === 'object';
}

function isArrayLike(a) {
  return a != null && typeof a !== 'function' && isLength(a.length);
}

function isArrayLikeObject(a) {
  return isObjectLike(a) && isArrayLike(a);
}

function union(...arrays) {
  // NODE 1: positional args collected by rest parameter

  // NODE 2: depth-1 flatten, keeping only array-like object args
  const buffer = [];
  for (const arg of arrays) {
    if (isArrayLikeObject(arg)) {
      const len = arg.length;
      for (let i = 0; i < len; i++) {
        buffer.push(arg[i]);
      }
    }
    // non-array-like-object args are dropped entirely
  }

  // NODE 3: SameValueZero dedup, first-occurrence, order-preserving.
  // +0 normalization: value !== 0 ? value : 0  forces any -0 to +0.
  // A JS Set uses SameValueZero internally: NaN deduplicates with NaN,
  // and -0/+0 are the same key. After normalization all zeros are +0,
  // so the Set will correctly deduplicate them.
  const result = [];
  const seenSet = new Set();

  for (let i = 0; i < buffer.length; i++) {
    // Normalize -0 to +0: for -0, (-0 !== 0) is false, so we get literal 0 (+0).
    const value = buffer[i] !== 0 ? buffer[i] : 0;
    if (!seenSet.has(value)) {
      seenSet.add(value);
      result.push(value);
    }
  }

  return result;
}

export default union;
