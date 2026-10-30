// Clean-room re-emission of `clone` (clone@2.1.2, npm, MIT) from a behavioral SIR contract.
// export default clone(parent, circular?, depth?, prototype?, includeNonEnumerable?)

function objToStr(o) {
  return Object.prototype.toString.call(o);
}

function isArray(obj) {
  return objToStr(obj) === '[object Array]';
}

function isRegExp(obj) {
  return objToStr(obj) === '[object RegExp]';
}

function isDate(obj) {
  return objToStr(obj) === '[object Date]';
}

function getRegExpFlags(re) {
  let flags = '';
  if (re.global) flags += 'g';
  if (re.ignoreCase) flags += 'i';
  if (re.multiline) flags += 'm';
  return flags;
}

export default function clone(parent, circular, depth, prototype, includeNonEnumerable) {
  // N0 — OPTIONS-OBJECT detection. Runs FIRST, before any defaulting.
  // typeof null === 'object' is true in JS, so `clone(x, null)` also enters this branch
  // and then throws reading properties off null — that is intentional, out-of-envelope
  // behavior we do NOT special-case away.
  if (typeof circular === 'object') {
    depth = circular.depth;
    prototype = circular.prototype;
    includeNonEnumerable = circular.includeNonEnumerable;
    circular = circular.circular;
  }

  // N1 — circular-tracking registers, shared across the whole recursion.
  const allParents = [];
  const allChildren = [];

  // N2
  const useBuffer = typeof Buffer !== 'undefined';

  // N3 — defaulting, strictly via typeof-undefined checks, AFTER N0.
  // prototype and includeNonEnumerable are intentionally NOT defaulted here:
  // prototype:null must survive as null, not get coerced to a default.
  if (typeof circular === 'undefined') circular = true;
  if (typeof depth === 'undefined') depth = Infinity;

  // N4
  return _clone(parent, depth);

  function _clone(parent, depth) {
    // N5
    if (parent === null) return null;

    // N6 — checked BEFORE the type ladder.
    if (depth === 0) return parent;

    // N7 — all non-object primitives (and functions) pass through unchanged.
    if (typeof parent !== 'object') {
      return parent;
    }

    let child;
    let proto; // stays undefined unless the plain-object branch (N12) assigns it.

    // ---- TYPE LADDER (exact order; first match wins) ----
    if (typeof Map !== 'undefined' && parent instanceof Map) {
      // N8
      child = new Map();
    } else if (typeof Set !== 'undefined' && parent instanceof Set) {
      // N9
      child = new Set();
    } else if (typeof Promise !== 'undefined' && parent instanceof Promise) {
      // N10
      child = new Promise((resolve, reject) => {
        parent.then(
          (value) => resolve(_clone(value, depth - 1)),
          (err) => reject(_clone(err, depth - 1))
        );
      });
    } else if (isArray(parent)) {
      // N11
      child = [];
    } else if (isRegExp(parent)) {
      // N11a
      const flags = getRegExpFlags(parent);
      child = new RegExp(parent.source, flags);
      if (parent.lastIndex) {
        child.lastIndex = parent.lastIndex;
      }
    } else if (isDate(parent)) {
      // N11b
      child = new Date(parent.getTime());
    } else if (useBuffer && Buffer.isBuffer(parent)) {
      // N11c — EARLY RETURN: no circular tracking, no for-in copy.
      child = Buffer.allocUnsafe(parent.length);
      parent.copy(child);
      return child;
    } else if (parent instanceof Error) {
      // N11d — clone's prototype IS the original error object.
      child = Object.create(parent);
    } else {
      // N12 — plain object / everything else (incl. typed arrays, class instances).
      if (typeof prototype === 'undefined') {
        proto = Object.getPrototypeOf(parent);
        child = Object.create(proto);
      } else {
        // prototype may legally be null here -> Object.create(null).
        child = Object.create(prototype);
        proto = prototype;
      }
    }

    // ---- PHASE 2 — circular / shared-reference tracking ----
    if (circular) {
      const index = allParents.indexOf(parent);
      if (index !== -1) {
        return allChildren[index];
      }
      allParents.push(parent);
      allChildren.push(child);
    }

    // ---- PHASE 3 — Map / Set entry copying ----
    if (typeof Map !== 'undefined' && parent instanceof Map) {
      for (const [key, value] of parent) {
        child.set(_clone(key, depth - 1), _clone(value, depth - 1));
      }
    }
    if (typeof Set !== 'undefined' && parent instanceof Set) {
      for (const value of parent) {
        child.add(_clone(value, depth - 1));
      }
    }

    // ---- PHASE 4 — own+inherited enumerable string-key copy (for-in) ----
    // !!! GUARD PINNED !!! — the guard is the JS truthy test `if (proto)`, NEVER
    // `proto !== undefined`. proto === null (forced null prototype) must fall
    // through this guard WITHOUT throwing and WITHOUT applying any skip set.
    for (const i in parent) {
      let attrs;
      if (proto) {
        attrs = Object.getOwnPropertyDescriptor(proto, i);
      }
      if (attrs && attrs.set == null) {
        continue;
      }
      child[i] = _clone(parent[i], depth - 1);
    }

    // ---- PHASE 5 — symbol keys ----
    if (typeof Object.getOwnPropertySymbols === 'function') {
      const symbols = Object.getOwnPropertySymbols(parent);
      for (const symbol of symbols) {
        const descriptor = Object.getOwnPropertyDescriptor(parent, symbol);
        if (descriptor && !descriptor.enumerable && !includeNonEnumerable) {
          continue;
        }
        child[symbol] = _clone(parent[symbol], depth - 1);
        if (descriptor && !descriptor.enumerable) {
          Object.defineProperty(child, symbol, { enumerable: false });
        }
      }
    }

    // ---- PHASE 6 — non-enumerable string keys ----
    if (includeNonEnumerable) {
      const propertyNames = Object.getOwnPropertyNames(parent);
      for (const propertyName of propertyNames) {
        const descriptor = Object.getOwnPropertyDescriptor(parent, propertyName);
        if (descriptor && descriptor.enumerable) {
          continue;
        }
        child[propertyName] = _clone(parent[propertyName], depth - 1);
        Object.defineProperty(child, propertyName, { enumerable: false });
      }
    }

    // N17
    return child;
  }
}
