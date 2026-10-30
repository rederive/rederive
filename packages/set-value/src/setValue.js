// @rederive/setValue — verified-recompose of set-value@4.1.0. quorum 3/3, differential 400/400, round 1. SIR: sir/setValue.sir
// setValue — clean-room re-emission from SIR (emit #3)
// PROVENANCE: set-value@4.1.0 (jonschlinkert/set-value, MIT)
// Inlined deps: is-primitive@3.0.1, is-plain-object@2.0.4, isobject@3.0.1

// ─── INLINED DEP: isobject@3.0.1 ──────────────────────────────────────────
function isObject_iso(val) {
  return val != null && typeof val === 'object' && Array.isArray(val) === false;
}

// ─── INLINED DEP: is-primitive@3.0.1 ──────────────────────────────────────
function isPrimitive(val) {
  if (typeof val === 'object') return val === null;
  return typeof val !== 'function';
}

// ─── INLINED DEP: is-plain-object@2.0.4 (needs isObjectObject) ────────────
function isObjectObject(o) {
  return isObject_iso(o) === true &&
    Object.prototype.toString.call(o) === '[object Object]';
}

function isPlainObject(o) {
  if (isObjectObject(o) === false) return false;
  const ctor = o.constructor;
  if (typeof ctor !== 'function') return false;
  const prot = ctor.prototype;
  if (isObjectObject(prot) === false) return false;
  if (prot.hasOwnProperty('isPrototypeOf') === false) return false;
  return true;
}

// ─── LOCAL isObject (distinct from isObject_iso) ──────────────────────────
// TRUE for non-null objects (including arrays) AND functions; FALSE for null + primitives
function isObject(value) {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

// ─── UNSAFE KEY GUARD ─────────────────────────────────────────────────────
function isUnsafeKey(key) {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

function validateKey(key) {
  if (!isPrimitive(key)) {
    throw new TypeError('Object keys must be strings or symbols');
  }
  if (isUnsafeKey(key)) {
    throw new Error(`Cannot set unsafe key: "${key}"`);
  }
}

// ─── MEMO KEY HELPERS ─────────────────────────────────────────────────────
function toStringKey(input) {
  return Array.isArray(input) ? input.flat().map(String).join(',') : input;
}

function createMemoKey(input, options) {
  if (typeof input !== 'string' || !options) return input;
  let key = input + ';';
  if (options.arrays        !== undefined) key += `arrays=${options.arrays};`;
  if (options.separator     !== undefined) key += `separator=${options.separator};`;
  if (options.split         !== undefined) key += `split=${options.split};`;
  if (options.merge         !== undefined) key += `merge=${options.merge};`;
  if (options.preservePaths !== undefined) key += `preservePaths=${options.preservePaths};`;
  return key;
}

// ─── STRING SPLIT ─────────────────────────────────────────────────────────
function splitString(input, options) {
  options = options || {};
  const sep = options.separator || '.';
  const preserve = (sep === '/') ? false : options.preservePaths;

  // PRESERVE-PATHS RULE: if path contains '/' and preserve is not explicitly false -> single key
  if (typeof input === 'string' && preserve !== false && /\//.test(input)) {
    return [input];
  }

  const parts = [];
  let part = '';

  function pushPart(p) {
    const number = Number(p);
    if (p.trim() !== '' && Number.isInteger(number)) {
      parts.push(number);
    } else {
      parts.push(p);
    }
  }

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '\\') {
      part += input[++i];
      continue;
    }
    if (ch === sep) {
      // interior empty segments ARE pushed (the 'a..b' case)
      pushPart(part);
      part = '';
      continue;
    }
    part += ch;
  }
  // trailing segment: only pushed if non-empty (falsy guard)
  if (part) pushPart(part);

  return parts;
}

// ─── MODULE-LEVEL MEMO CACHE ──────────────────────────────────────────────
const cache = new Map();

function memoize(input, options, fn) {
  const memoKey = createMemoKey(input, options);
  const cacheKey = toStringKey(memoKey);
  validateKey(cacheKey);  // side-effect: throw on unsafe memo key
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const result = fn();
  cache.set(cacheKey, result);
  return result;
}

// ─── SPLIT (dispatches to custom / symbol / array / string) ───────────────
function split(input, options) {
  if (options && typeof options.split === 'function') {
    return options.split(input);
  }
  if (typeof input === 'symbol') {
    return [input];
  }
  if (Array.isArray(input)) {
    return input;
  }
  return memoize(input, options, () => splitString(input, options));
}

// ─── LEAF ASSIGN ──────────────────────────────────────────────────────────
function assignProp(obj, prop, value, options) {
  validateKey(prop);

  if (value === undefined) {
    Reflect.deleteProperty(obj, prop);
  } else if (options && options.merge) {
    // BEHAVIORAL QUIRK: comparison is to the STRING 'function', not typeof check
    const merge = (options.merge === 'function') ? options.merge : Object.assign;
    if (merge && isPlainObject(obj[prop]) && isPlainObject(value)) {
      obj[prop] = merge(obj[prop], value);
    } else {
      obj[prop] = value;
    }
  } else {
    obj[prop] = value;
  }
  return obj;
}

// ─── MAIN FUNCTION ────────────────────────────────────────────────────────
function setValue(target, path, value, options) {
  // BRANCH-GUARD
  if (!path || !isObject(target)) return target;

  // BRANCH-SPLIT
  const keys = split(path, options);

  // BRANCH-LOOP
  let obj = target;
  for (let i = 0; i < keys.length; i++) {
    const key  = keys[i];
    const next = keys[i + 1]; // undefined past end

    validateKey(key);

    if (next === undefined) {
      // LEAF
      assignProp(obj, key, value, options);
      break;
    }

    if (typeof next === 'number' && !Array.isArray(obj[key])) {
      // next segment is numeric AND current slot is NOT already an array -> fresh array
      obj = obj[key] = [];
      continue;
    }

    if (!isObject(obj[key])) {
      // current slot is null / undefined / primitive -> fresh plain object
      obj[key] = {};
    }

    obj = obj[key];
  }

  return target;
}

// Expose cache/clear/split as static properties (part of the side API;
// observably transparent per NOTE-CACHE but kept for structural completeness)
setValue.cache  = cache;
setValue.clear  = () => cache.clear();
setValue.split  = split;

export default setValue;
