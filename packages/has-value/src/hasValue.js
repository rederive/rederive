// @rederive/hasValue — verified-recompose of has-value@2.0.2. quorum 3/3, differential 400/400, round 1. SIR: sir/hasValue.sir
// hasValue — self-contained re-emission of has-value@2.0.2
// Inlines: get-value@3.0.1, has-values@2.0.1, kind-of@6.0.3, isobject@3.0.1

// ---------------------------------------------------------------------------
// kind-of@6.0.3
// ---------------------------------------------------------------------------
function isGeneratorFn(val) {
  const tag = Object.prototype.toString.call(val);
  return tag === '[object GeneratorFunction]';
}

function isGeneratorObj(val) {
  return val != null &&
    typeof val.throw === 'function' &&
    typeof val.return === 'function' &&
    typeof val.next === 'function';
}

function isBuffer(val) {
  if (val == null) return false;
  if (typeof val.constructor === 'function' &&
      typeof val.constructor.isBuffer === 'function' &&
      val.constructor.isBuffer(val)) return true;
  return false;
}

function isArguments(val) {
  if (val == null) return false;
  return Object.prototype.toString.call(val) === '[object Arguments]';
}

function isDate(val) {
  if (val instanceof Date) return true;
  if (val == null || typeof val !== 'object') return false;
  return typeof val.getDate === 'function';
}

function isError(val) {
  if (val instanceof Error) return true;
  if (val == null || typeof val !== 'object') return false;
  return typeof val.message === 'string' && typeof val.stack === 'string';
}

function isRegexp(val) {
  if (val instanceof RegExp) return true;
  if (val == null || typeof val !== 'object') return false;
  return typeof val.test === 'function' && typeof val.exec === 'function';
}

function ctorName(val) {
  if (val == null || typeof val.constructor !== 'function') return null;
  return val.constructor.name || null;
}

function kindOf(val) {
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  const t = typeof val;
  if (t === 'boolean') return 'boolean';
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'symbol') return 'symbol';
  if (t === 'bigint') {
    // bigint: typeof 'bigint', no branch catches it before fallback
    // toString.call(0n) = '[object BigInt]' -> slice(8,-1).toLowerCase() = 'bigint'
    const s2 = Object.prototype.toString.call(val);
    return s2.slice(8, -1).toLowerCase().replace(/\s/g, '');
  }
  if (t === 'function') {
    return isGeneratorFn(val) ? 'generatorfunction' : 'function';
  }
  if (Array.isArray(val)) return 'array';
  if (isBuffer(val)) return 'buffer';
  if (isArguments(val)) return 'arguments';
  if (isDate(val)) return 'date';
  if (isError(val)) return 'error';
  if (isRegexp(val)) return 'regexp';

  const name = ctorName(val);
  switch (name) {
    case 'Symbol': return 'symbol';
    case 'Promise': return 'promise';
    case 'WeakMap': return 'weakmap';
    case 'WeakSet': return 'weakset';
    case 'Map': return 'map';
    case 'Set': return 'set';
    case 'Int8Array': return 'int8array';
    case 'Uint8Array': return 'uint8array';
    case 'Uint8ClampedArray': return 'uint8clampedarray';
    case 'Int16Array': return 'int16array';
    case 'Uint16Array': return 'uint16array';
    case 'Int32Array': return 'int32array';
    case 'Uint32Array': return 'uint32array';
    case 'Float32Array': return 'float32array';
    case 'Float64Array': return 'float64array';
  }

  if (isGeneratorObj(val)) return 'generator';

  const s = Object.prototype.toString.call(val);
  switch (s) {
    case '[object Object]': return 'object';
    case '[object Map Iterator]': return 'mapiterator';
    case '[object Set Iterator]': return 'setiterator';
    case '[object String Iterator]': return 'stringiterator';
    case '[object Array Iterator]': return 'arrayiterator';
  }

  return s.slice(8, -1).toLowerCase().replace(/\s/g, '');
}

// ---------------------------------------------------------------------------
// has-values@2.0.1
// ---------------------------------------------------------------------------
function hasValues(val) {
  const k = kindOf(val);
  switch (k) {
    case 'boolean':   return true;
    case 'date':      return true;
    case 'function':  return true;
    case 'null':      return true;
    case 'number':    return true;
    case 'undefined': return false;
    case 'regexp':
      return val.source !== '(?:)' && val.source !== '';
    case 'buffer':
      return val.toString() !== '';
    case 'error':
      return val.message !== '';
    case 'string':
      return val.length !== 0;
    case 'arguments':
      return val.length !== 0;
    case 'file':
      return val.size !== 0;
    case 'map':
      return val.size !== 0;
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

// ---------------------------------------------------------------------------
// isobject@3.0.1  (used by get-value for the options-shape test)
// ---------------------------------------------------------------------------
function isobjectGV(val) {
  return val != null && typeof val === 'object' && !Array.isArray(val);
}

// ---------------------------------------------------------------------------
// get-value@3.0.1  helpers
// ---------------------------------------------------------------------------
function isValidObject(val) {
  return isobjectGV(val) || Array.isArray(val) || typeof val === 'function';
}

function splitPath(path, splitChar, options) {
  if (typeof options.split === 'function') {
    return options.split(path);
  }
  return path.split(splitChar);
}

function joinSegs(segs2, joinChar, options) {
  if (typeof options.join === 'function') {
    return options.join(segs2);
  }
  return segs2[0] + joinChar + segs2[1];
}

function isValid(key, target, options) {
  if (typeof options.isValid === 'function') {
    return options.isValid(key, target);
  }
  return true;
}

// ---------------------------------------------------------------------------
// get-value@3.0.1
// ---------------------------------------------------------------------------
function getValue(target, path, options) {
  // (1) Normalize options
  if (!isobjectGV(options)) {
    options = { default: options };
  }

  // (2) target must be a valid object to descend into
  if (!isValidObject(target)) {
    return options.default !== undefined ? options.default : target;
  }

  // (3) numeric path coercion (unreachable from hasValue, but kept for fidelity)
  if (typeof path === 'number') {
    path = String(path);
  }

  const isArray = Array.isArray(path);
  const isString = typeof path === 'string';
  const splitChar = options.separator || '.';
  const joinChar = options.joinChar || (typeof splitChar === 'string' ? splitChar : '.');

  if (!isString && !isArray) {
    return target;
  }

  // (4) FAST PATH: string path that is itself a literal own/in key
  if (isString && (path in target)) {
    return isValid(path, target, options) ? target[path] : options.default;
  }

  // (5) Segment walk
  const segs = isArray ? path : splitPath(path, splitChar, options);
  const len = segs.length;
  let idx = 0;

  do {
    let prop = segs[idx];
    if (typeof prop === 'number') prop = String(prop);

    // (5a) backslash-escape continuation
    while (prop && prop.slice(-1) === '\\') {
      prop = joinSegs([prop.slice(0, -1), segs[++idx] || ''], joinChar, options);
    }

    if (prop in target) {
      if (!isValid(prop, target, options)) return options.default;
      target = target[prop];
    } else {
      // (5b) GREEDY JOIN
      let hasProp = false;
      let n = idx + 1;
      while (n < len) {
        prop = joinSegs([prop, segs[n++]], joinChar, options);
        if ((hasProp = (prop in target))) {
          if (!isValid(prop, target, options)) return options.default;
          target = target[prop];
          idx = n - 1;
          break;
        }
      }
      if (!hasProp) return options.default;
    }
  } while (++idx < len && isValidObject(target));

  if (idx === len) return target;
  return options.default;
}

// ---------------------------------------------------------------------------
// has-value@2.0.2  — the top-level export
// ---------------------------------------------------------------------------
function isobjectLoose(val) {
  return val != null &&
    (typeof val === 'object' || typeof val === 'function' || Array.isArray(val));
}

function hasValue(obj, path, options) {
  if (isobjectLoose(obj) && (typeof path === 'string' || Array.isArray(path))) {
    return hasValues(getValue(obj, path, options));
  }
  return false;
}

export default hasValue;
