// @rederive/hasValues — verified-recompose of has-values@2.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/hasValues.sir
// Clean-room re-emission of has-values@2.0.1 with inlined kind-of@6.0.3
// Generated from SIR + frozen oracle. No imports, no dependencies.

function kindOf(val) {
  // Step 1: undefined
  if (val === undefined) return 'undefined';
  // Step 2: null
  if (val === null) return 'null';

  const t = typeof val;
  // Step 3: primitives
  if (t === 'boolean') return 'boolean';
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'symbol') return 'symbol';
  if (t === 'function') {
    // Check for GeneratorFunction
    const cname = (val.constructor && typeof val.constructor === 'function') ? val.constructor.name : null;
    if (cname === 'GeneratorFunction') return 'generatorfunction';
    return 'function';
  }

  // Step 4: array
  if (Array.isArray(val)) return 'array';

  // Step 5: buffer (Node Buffer)
  if (val.constructor && typeof val.constructor.isBuffer === 'function' && val.constructor.isBuffer(val)) {
    return 'buffer';
  }

  // Step 6: arguments
  if (typeof val.length === 'number') {
    let isArgs = false;
    try {
      // Access callee; in strict mode this throws
      if (typeof val.callee === 'function') isArgs = true;
    } catch (err) {
      if (err && typeof err.message === 'string' && err.message.indexOf('callee') !== -1) {
        isArgs = true;
      }
    }
    if (isArgs) return 'arguments';
  }

  // Step 7: date
  if (val instanceof Date) return 'date';
  // Duck-type date
  if (typeof val.toDateString === 'function' && typeof val.getDate === 'function' && typeof val.setDate === 'function') {
    return 'date';
  }

  // Step 8: error
  if (val instanceof Error) return 'error';
  // Duck-type error
  if (typeof val.message === 'string' && val.constructor && typeof val.constructor.stackTraceLimit === 'number') {
    return 'error';
  }

  // Step 9: regexp
  if (val instanceof RegExp) return 'regexp';
  // Duck-type regexp
  if (typeof val.flags === 'string' && typeof val.ignoreCase === 'boolean' && typeof val.multiline === 'boolean' && typeof val.global === 'boolean') {
    return 'regexp';
  }

  // Step 10: constructor name switch
  const ctorName = (typeof val.constructor === 'function') ? val.constructor.name : null;
  if (ctorName !== null) {
    switch (ctorName) {
      case 'Symbol':            return 'symbol';
      case 'Promise':           return 'promise';
      case 'WeakMap':           return 'weakmap';
      case 'WeakSet':           return 'weakset';
      case 'Map':               return 'map';
      case 'Set':               return 'set';
      case 'Int8Array':         return 'int8array';
      case 'Uint8Array':        return 'uint8array';
      case 'Uint8ClampedArray': return 'uint8clampedarray';
      case 'Int16Array':        return 'int16array';
      case 'Uint16Array':       return 'uint16array';
      case 'Int32Array':        return 'int32array';
      case 'Uint32Array':       return 'uint32array';
      case 'Float32Array':      return 'float32array';
      case 'Float64Array':      return 'float64array';
    }
  }

  // Step 11: generator object (throw/return/next are all functions)
  if (typeof val.next === 'function' && typeof val.return === 'function' && typeof val.throw === 'function') {
    return 'generator';
  }

  // Step 12: Object.prototype.toString tag switch
  const tag = Object.prototype.toString.call(val);
  switch (tag) {
    case '[object Object]':          return 'object';
    case '[object Map Iterator]':    return 'mapiterator';
    case '[object Set Iterator]':    return 'setiterator';
    case '[object String Iterator]': return 'stringiterator';
    case '[object Array Iterator]':  return 'arrayiterator';
  }

  // Step 13: fallback — strip '[object ' prefix and ']' suffix, lowercase, remove spaces
  return tag.slice(8, -1).toLowerCase().replace(/\s/g, '');
}

export default function hasValues(value) {
  const kind = kindOf(value);

  // NODE 1: always true
  if (kind === 'boolean' || kind === 'date' || kind === 'function' || kind === 'null' || kind === 'number') {
    return true;
  }

  // NODE 2: undefined -> false
  if (kind === 'undefined') {
    return false;
  }

  // NODE 3: regexp -> non-empty source
  if (kind === 'regexp') {
    return value.source !== '(?:)' && value.source !== '';
  }

  // NODE 4: buffer -> toString() !== ''
  if (kind === 'buffer') {
    return value.toString() !== '';
  }

  // NODE 5: error -> message !== ''
  if (kind === 'error') {
    return value.message !== '';
  }

  // NODE 6: string or arguments -> length !== 0
  if (kind === 'string' || kind === 'arguments') {
    return value.length !== 0;
  }

  // NODE 7: file, map, set -> size !== 0
  if (kind === 'file' || kind === 'map' || kind === 'set') {
    return value.size !== 0;
  }

  // NODE 8: array or object -> recurse over Object.keys
  if (kind === 'array' || kind === 'object') {
    const keys = Object.keys(value);
    for (const key of keys) {
      if (hasValues(value[key])) return true;
    }
    return false;
  }

  // NODE 9: default -> true
  return true;
}
