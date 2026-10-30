// @rederive/unionValue — verified-recompose of union-value@2.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/unionValue.sir
// Clean-room re-emission of union-value@2.0.1 per unionValue.sir
// Inlines: get-value@3.0.1, set-value@3.0.3, isobject@3.0.1 semantics.
// No external imports.

export default function unionValue(obj, prop, value) {
  // -----------------------------------------------------------------------
  // NODE 1 — ARGUMENT GUARDS
  // -----------------------------------------------------------------------
  // 1a. union-value's own local isObject: not null, typeof 'object', not Array
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new TypeError('expected the first argument to be an object');
  }
  // 1b. prop must be a string
  if (typeof prop !== 'string') {
    throw new TypeError('expected the second argument to be a string');
  }

  // -----------------------------------------------------------------------
  // NODE 2 — GET(obj, prop)  [get-value@3.0.1 semantics, inlined]
  // -----------------------------------------------------------------------
  function isObject_get(v) {
    return v != null && typeof v === 'object' && !Array.isArray(v);
  }
  function isValidObject(v) {
    return isObject_get(v) || Array.isArray(v) || typeof v === 'function';
  }

  function getValue(target, path) {
    // default is undefined (no 3rd arg to get())
    if (!isValidObject(target)) return undefined;

    // FAST PATH: whole path is a single inherited/own key
    if (path in target) {
      return target[path];
    }

    // SPLIT PATH
    var segs = path.split('.');
    var len = segs.length;
    var idx = 0;

    while (idx < len) {
      var seg = segs[idx];

      // backslash-continuation: segment ending in '\' joins with next using '.'
      while (seg && seg.endsWith('\\')) {
        seg = seg.slice(0, -1) + '.' + (segs[++idx] || '');
      }

      if (seg in target) {
        target = target[seg];
      } else {
        // greedy re-join: try joining with following segments to find literal-dot key
        var hasProp = false;
        var n = idx + 1;
        while (n < len) {
          seg = seg + '.' + segs[n++];
          if (seg in target) {
            target = target[seg];
            idx = n - 1;
            hasProp = true;
            break;
          }
        }
        if (!hasProp) return undefined;
      }

      idx++;
      // continue if still valid object to descend into
      if (idx < len && !isValidObject(target)) {
        return undefined;
      }
    }

    if (idx === len) return target;
    return undefined;
  }

  // -----------------------------------------------------------------------
  // NODE 3 — BUILD base array `arr`
  // -----------------------------------------------------------------------
  var existing = getValue(obj, prop);

  // first(existing, []) := first arg that != null (not null AND not undefined)
  var base = (existing != null) ? existing : [];

  // [].concat(base): if base is array, splice elements; otherwise wrap as single element
  var arr = [].concat(base);

  // -----------------------------------------------------------------------
  // NODE 4 — BUILD value array and UNION
  // -----------------------------------------------------------------------
  // first(value, [])
  var valBase = (value != null) ? value : [];
  // [].concat: array -> splice, non-array -> wrap
  var valArg = [].concat(valBase);

  // union-value's own deep flatten
  function flatten() {
    var res = [];
    function flat(a) {
      for (var i = 0; i < a.length; i++) {
        var ele = a[i];
        if (Array.isArray(ele)) {
          flat(ele);
        } else {
          res.push(ele);
        }
      }
    }
    // flatten(arr, valArg) — args = [arr, valArg], both arrays, so flat iterates over them
    flat([arr, valArg]);
    return res;
  }

  // unique: first-occurrence-wins via indexOf (strict ===); NaN dropped (indexOf(NaN)===-1 always)
  function unique(a) {
    return a.filter(function(v, i) {
      return a.indexOf(v) === i;
    });
  }

  var result = unique(flatten());

  // -----------------------------------------------------------------------
  // NODE 5 — SET(obj, prop, result)  [set-value@3.0.3 semantics, inlined]
  // -----------------------------------------------------------------------
  function isObject_set(v) {
    return v !== null && (typeof v === 'object' || typeof v === 'function');
  }

  // set-value's split with backslash-continuation
  function splitPath(path) {
    var keys = path.split('.');
    var res = [];
    var i = 0;
    while (i < keys.length) {
      var seg = keys[i];
      // backslash-continuation: segment ends with '\' AND next key exists
      while (seg && seg.endsWith('\\') && keys[i + 1] != null) {
        seg = seg.slice(0, -1) + '.' + keys[++i];
      }
      res.push(seg);
      i++;
    }
    return res;
  }

  // isValidKey: drops __proto__, constructor, prototype
  function isValidKey(key) {
    var k = String(key);
    return k !== '__proto__' && k !== 'constructor' && k !== 'prototype';
  }

  function setValue(target, path, val) {
    if (!isObject_set(target)) return target;

    var keys = splitPath(path).filter(isValidKey);
    var len = keys.length;
    var orig = target;

    // FAST PATH: exactly one key
    if (len === 1) {
      target[keys[0]] = val;
      return orig;
    }

    // GENERAL PATH: walk/create intermediates
    for (var i = 0; i < len; i++) {
      var k = keys[i];
      if (!isObject_set(target[k])) {
        target[k] = {};
      }
      if (i === len - 1) {
        target[k] = val;
        break;
      }
      target = target[k];
    }
    return orig;
  }

  setValue(obj, prop, result);

  // -----------------------------------------------------------------------
  // NODE 6 — RETURN obj (same, mutated)
  // -----------------------------------------------------------------------
  return obj;
}
