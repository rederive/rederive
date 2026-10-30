// @rederive/longest — verified-recompose of longest@2.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/longest.sir
export default function longest(arr) {
  // n0: GUARD non-array
  if (!Array.isArray(arr)) {
    throw new TypeError("expected an array");
  }

  // n1: EMPTY
  const len = arr.length;
  if (len === 0) {
    return undefined;
  }

  // n2: SEED from first element — UNGUARDED .length read
  let val = arr[0];
  if (typeof val === 'number') {
    val = String(val);
  }
  // This will throw a native TypeError if val is null or undefined
  let longest = val.length;
  let idx = 0;

  // n3: ITERATE remaining elements
  while (++idx < len) {
    let ele = arr[idx];

    // n3a: SKIP nullish (null, undefined, holes)
    if (ele == null) {
      continue;
    }

    // n3b: STRINGIFY number
    if (typeof ele === 'number') {
      ele = String(ele);
    }

    // n3c: READ length with guard
    const elen = ele.length;
    if (typeof elen !== 'number') {
      continue;
    }

    // n3d: REPLACE (strict greater — first wins on ties)
    if (elen > longest) {
      longest = elen;
      val = ele;
    }
  }

  // n4: RETURN val
  return val;
}
