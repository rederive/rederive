// @rederive/equal — verified-recompose of fast-deep-equal@3.1.3. quorum 3/3, differential 400/400, round 1. SIR: sir/equal.sir
export default function equal(a, b) {
  // NODE 0 — identity short-circuit
  if (a === b) return true;

  // NODE 1 — "both are non-null objects" gate
  if (a && b && typeof a == 'object' && typeof b == 'object') {

    // NODE 1a — constructor check
    if (a.constructor !== b.constructor) return false;

    // NODE 2 — Array branch
    if (Array.isArray(a)) {
      var length = a.length;
      if (length != b.length) return false;
      for (var i = length; i-- !== 0;)
        if (!equal(a[i], b[i])) return false;
      return true;
    }

    // NODE 3a — RegExp branch
    if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;

    // NODE 3b — valueOf branch
    if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();

    // NODE 3c — toString branch
    if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();

    // NODE 4 — generic own-enumerable-keys branch
    var keys = Object.keys(a);
    var length = keys.length;
    if (length !== Object.keys(b).length) return false;
    for (var i = length; i-- !== 0;)
      if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
    for (var i = length; i-- !== 0;) {
      var key = keys[i];
      if (!equal(a[key], b[key])) return false;
    }
    return true;
  }

  // NODE 5 — both-NaN tail
  return a !== a && b !== b;
}
