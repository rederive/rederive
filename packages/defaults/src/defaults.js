// @rederive/defaults — verified-recompose of defaults@1.0.4. quorum 3/3, differential 400/400, round 1. SIR: sir/defaults.sir
// Reconstructed from defaults@1.0.4 SIR + frozen oracle.
// Self-contained ES module: no external dependencies.
// Deep-clone behavior is inlined from clone@1.0.4 (circular=true, depth=Infinity, prototype=undefined).

function deepCloneValue(value) {
  // Per-key top-level call: fresh allParents/allChildren registers for each default value's subgraph.
  const allParents = [];
  const allChildren = [];

  function deepClone(parent, depth) {
    // C1: null -> null
    if (parent === null) return null;

    // C2: depth === 0 -> return same ref (never fires at Infinity, but implement faithfully)
    if (depth === 0) return parent;

    // C3: typeof parent !== 'object' -> return as-is (primitives, functions, symbols, bigints, undefined)
    if (typeof parent !== 'object') return parent;

    // From here: non-null object. TYPE LADDER (first match wins).

    let child;
    let proto;

    const tag = Object.prototype.toString.call(parent);

    // C4: Array
    if (tag === '[object Array]') {
      child = [];
      // proto is NOT set for arrays -> no proto-collision skip in C10
    }
    // C5: RegExp
    else if (tag === '[object RegExp]') {
      let flags = '';
      if (parent.global) flags += 'g';
      if (parent.ignoreCase) flags += 'i';
      if (parent.multiline) flags += 'm';
      child = new RegExp(parent.source, flags);
      if (parent.lastIndex) child.lastIndex = parent.lastIndex;
      // No circular tracking, but still goes through C9 below.
      // Actually RegExp is an object -> falls through to C9.
    }
    // C6: Date
    else if (tag === '[object Date]') {
      child = new Date(parent.getTime());
    }
    // C7: Buffer (Node.js Buffer)
    else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(parent)) {
      // Early return: no circular tracking, no for-in copy.
      const buf = Buffer.allocUnsafe(parent.length);
      parent.copy(buf);
      return buf;
    }
    // C8: plain object / everything else (class instances, objects with custom prototypes)
    else {
      proto = Object.getPrototypeOf(parent);
      child = Object.create(proto);
    }

    // C9: Circular / shared-ref tracking (skipped for Buffer which returned early at C7)
    const index = allParents.indexOf(parent);
    if (index !== -1) {
      return allChildren[index];
    }
    allParents.push(parent);
    allChildren.push(child);

    // C10: for-in loop: own + inherited enumerable string keys
    for (const i in parent) {
      // PROTO-COLLISION SKIP: only applies when proto is set (C8 plain-object branch)
      if (proto !== undefined) {
        const attrs = Object.getOwnPropertyDescriptor(proto, i);
        if (attrs && attrs.set == null) {
          // set == null means no setter -> skip this key (it's an Object.prototype data property)
          continue;
        }
      }
      child[i] = deepClone(parent[i], depth - 1);
    }

    // C11: return child
    return child;
  }

  return deepClone(value, Infinity);
}

function defaults(options, defaultsObj) {
  // B0: falsy guard
  options = options || {};

  // B1: iterate Object.keys(defaultsObj) — throws TypeError if defaultsObj is null/undefined
  Object.keys(defaultsObj).forEach(function (key) {
    // B2: undefined-only fallback test
    if (typeof options[key] === 'undefined') {
      options[key] = deepCloneValue(defaultsObj[key]);
    }
  });

  // B3: return the (possibly mutated) options reference
  return options;
}

export default defaults;
