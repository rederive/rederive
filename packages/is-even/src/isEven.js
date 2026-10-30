// @rederive/isEven — verified-recompose of is-even@1.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/isEven.sir
// Clean-room reconstruction of isEven (is-even@1.0.0 transitive chain).
// Inlines: is-odd@0.1.2 -> is-number@3.0.0 -> kind-of@3.2.2 -> is-buffer@1.1.6
// Zero imports. Self-contained. Behavior per SIR contract.

function isNumberLike(i) {
  // NODE 1a: classify JS runtime type (inlined kind-of@3.2.2)
  let type;
  if (typeof i === 'string' || i instanceof String) {
    type = 'string';
  } else if (typeof i === 'number' || i instanceof Number) {
    type = 'number';
  } else {
    type = 'other';
  }

  // Step B: branch on classified type
  if (type === 'string') {
    // Empty or whitespace-only string is NOT number-like
    if (i.trim() === '') {
      return false;
    }
    // Fall through to Step C (string coercion via arithmetic)
  } else if (type !== 'number') {
    // Non-string, non-number: not number-like
    return false;
  }
  // Step C: numeric coercion test
  // (i - i + 1) >= 0
  //   finite number/coercible string -> 1 >= 0 -> true
  //   NaN -> NaN >= 0 -> false
  //   +/-Infinity -> NaN >= 0 -> false
  return (i - i + 1) >= 0;
}

function isOdd(i) {
  // NODE 1: number-like gate
  if (!isNumberLike(i)) {
    throw new TypeError('is-odd expects a number.');
  }

  // NODE 2: integer gate
  // Number(i) converts string to number; Math.floor(i) does the same internally.
  if (Number(i) !== Math.floor(i)) {
    throw new RangeError('is-odd expects an integer.');
  }

  // NODE 3: parity via ToInt32 (~~i) & 1
  return !!(~~i & 1);
}

export default function isEven(i) {
  // isEven = !isOdd(i); throws propagate unchanged
  return !isOdd(i);
}
