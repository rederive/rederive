// @rederive/unsetValue — verified-recompose of unset-value@2.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/unsetValue.sir
// Clean-room reconstruction of unset-value@2.0.1 (unsetValue)
// All helpers inlined per SIR DEPENDS-ON specification.
// No external imports.

// H1. isObject (isobject@4.0.0)
function isObject(val) {
  return val != null && typeof val === 'object' && Array.isArray(val) === false;
}

// H2. kindOf (kind-of@6.0.3, subset reachable from has-values)
function kindOf(val) {
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  const t = typeof val;
  if (t === 'boolean') return 'boolean';
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'symbol') return 'symbol';
  if (t === 'function') return 'function';
  if (Array.isArray(val)) return 'array';
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(val)) return 'buffer';
  if (val instanceof Date) return 'date';
  if (val instanceof Error) return 'error';
  if (val instanceof RegExp) return 'regexp';
  const ctor = (typeof val.constructor === 'function') ? val.constructor.name : null;
  if (ctor === 'Map') return 'map';
  if (ctor === 'Set') return 'set';
  if (ctor === 'Promise') return 'promise';
  if (ctor === 'WeakMap') return 'weakmap';
  if (ctor === 'WeakSet') return 'weakset';
  const ts = Object.prototype.toString.call(val);
  if (ts === '[object Object]') return 'object';
  return ts.slice(8, -1).toLowerCase().replace(/\s/g, '');
}

// H3. hasValues (has-values@2.0.1)
function hasValues(val) {
  const kind = kindOf(val);
  switch (kind) {
    case 'boolean':
    case 'date':
    case 'function':
    case 'null':
    case 'number':
      return true;
    case 'undefined':
      return false;
    case 'regexp':
      return val.source !== '(?:)' && val.source !== '';
    case 'buffer':
      return val.toString() !== '';
    case 'error':
      return val.message !== '';
    case 'string':
    case 'arguments':
      return val.length !== 0;
    case 'file':
    case 'map':
    case 'set':
      return val.size !== 0;
    case 'array':
    case 'object': {
      const keys = Object.keys(val);
      for (let i = 0; i < keys.length; i++) {
        if (hasValues(val[keys[i]])) return true;
      }
      return false;
    }
    default:
      return true;
  }
}

// H4. getValue (get-value@3.0.1)
function getValue(target, path, options) {
  function gvIsObject(v) {
    return v != null && typeof v === 'object' && !Array.isArray(v);
  }
  function isValidObject(v) {
    return gvIsObject(v) || Array.isArray(v) || typeof v === 'function';
  }

  if (!gvIsObject(options)) {
    options = { default: options };
  }

  if (!isValidObject(target)) {
    return options.default;
  }

  if (typeof path === 'number') {
    path = String(path);
  }

  const isArr = Array.isArray(path);
  const isStr = typeof path === 'string';

  const splitChar = options.separator || '.';
  // joinChar not needed in navigation but noted
  // const joinChar = options.joinChar || '.';

  if (!isStr && !isArr) {
    return target;
  }

  if (isStr && (path in target)) {
    return target[path];
  }

  const segs = isArr ? path.slice() : path.split(splitChar);
  const len = segs.length;
  let idx = 0;

  do {
    let prop = segs[idx];
    if (typeof prop === 'number') prop = String(prop);

    // escaped-dot reassembly (get-value's version)
    while (prop && prop.slice(-1) === '\\') {
      prop = prop.slice(0, -1) + '.' + (segs[++idx] || '');
    }

    if (prop in target) {
      target = target[prop];
    } else {
      let hasProp = false;
      let n = idx + 1;
      while (n < len) {
        prop = prop + '.' + segs[n++];
        if (prop in target) {
          target = target[prop];
          idx = n - 1;
          hasProp = true;
          break;
        }
      }
      if (!hasProp) return options.default;
    }
  } while (++idx < len && isValidObject(target));

  return (idx === len) ? target : options.default;
}

// H5. hasValue (has-value@2.0.2)
function hasValue(obj, path) {
  function hvIsObject(v) {
    return v != null && (typeof v === 'object' || typeof v === 'function' || Array.isArray(v));
  }
  if (hvIsObject(obj) && (typeof path === 'string' || Array.isArray(path))) {
    return hasValues(getValue(obj, path));
  }
  return false;
}

// H6. isUnsafeKey
function isUnsafeKey(key) {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

// H7. validateKey
function validateKey(key) {
  if (isUnsafeKey(key)) {
    throw new Error(`Cannot set unsafe key: "${key}"`);
  }
}

// MAIN: unsetValue
function unsetValue(obj, prop) {
  // NODE 1: guard / THROW
  if (!isObject(obj)) {
    throw new TypeError('expected an object.');
  }

  // NODE 2: compute isArray
  const isArr = Array.isArray(prop);

  // NODE 3: fast path — own top-level key (non-array path only)
  if (!isArr && Object.prototype.hasOwnProperty.call(obj, prop)) {
    delete obj[prop];
    return true;
  }

  // NODE 4: presence check via has-value
  if (hasValue(obj, prop)) {
    // 4a. build segments
    let segs = isArr ? prop.slice() : prop.split('.');
    let last = segs.pop();

    // 4b. escaped-dot reassembly (unsetValue's OWN version — only folds trailing backslash
    //     from the segment immediately before `last`, iteratively while condition holds)
    while (segs.length && segs[segs.length - 1].slice(-1) === '\\') {
      last = segs.pop().slice(0, -1) + '.' + last;
    }

    // 4d. walk to parent, validating each intermediate key
    while (segs.length) {
      const key = segs.shift();
      validateKey(key);
      obj = obj[key];
    }

    // 4e. delete the last key and return its delete result
    return (delete obj[last]);
  }

  // NODE 5: fallthrough — return true without mutating
  return true;
}

export default unsetValue;
