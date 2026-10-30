// @rederive/kindOf — verified-recompose of kind-of@6.0.3. quorum 3/3, differential 400/400, round 1. SIR: sir/kindOf.sir
// Reconstructed from kindOf.sir — clean-room re-emission, emit_3
// kind-of@6.0.3 (MIT) — jonschlinkert

const toString = Object.prototype.toString;

function ctorName(val) {
  return (typeof val.constructor === 'function') ? val.constructor.name : null;
}

function isArray(val) {
  if (Array.isArray) return Array.isArray(val);
  return (val instanceof Array);
}

function isBuffer(val) {
  if (val.constructor && typeof val.constructor.isBuffer === 'function') {
    return val.constructor.isBuffer(val);
  }
  return false;
}

function isArguments(val) {
  try {
    if (typeof val.length === 'number' && typeof val.callee === 'function') return true;
  } catch (err) {
    if (err.message.indexOf('callee') !== -1) return true;
  }
  return false;
}

function isDate(val) {
  if (val instanceof Date) return true;
  return typeof val.toDateString === 'function'
      && typeof val.getDate      === 'function'
      && typeof val.setDate      === 'function';
}

function isError(val) {
  return (val instanceof Error)
      || (typeof val.message === 'string'
          && val.constructor
          && typeof val.constructor.stackTraceLimit === 'number');
}

function isRegexp(val) {
  if (val instanceof RegExp) return true;
  return typeof val.flags      === 'string'
      && typeof val.ignoreCase === 'boolean'
      && typeof val.multiline  === 'boolean'
      && typeof val.global     === 'boolean';
}

function isGeneratorFn(val) {
  return ctorName(val) === 'GeneratorFunction';
}

function isGeneratorObj(val) {
  return typeof val.throw  === 'function'
      && typeof val.return === 'function'
      && typeof val.next   === 'function';
}

export default function kindOf(val) {
  // --- A. void / null fast paths ---
  if (val === undefined) return 'undefined';
  if (val === null)      return 'null';

  // --- B. typeof fast paths ---
  var type = typeof val;
  if (type === 'boolean')  return 'boolean';
  if (type === 'string')   return 'string';
  if (type === 'number')   return 'number';
  if (type === 'symbol')   return 'symbol';
  if (type === 'function') return isGeneratorFn(val) ? 'generatorfunction' : 'function';
  // bigint falls through here

  // --- C. instance / duck-typed object predicates ---
  if (isArray(val))     return 'array';
  if (isBuffer(val))    return 'buffer';
  if (isArguments(val)) return 'arguments';
  if (isDate(val))      return 'date';
  if (isError(val))     return 'error';
  if (isRegexp(val))    return 'regexp';

  // --- D. constructor-name switch ---
  var cn = ctorName(val);
  switch (cn) {
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
    // no default — fall through to E then F
  }

  // --- E. generator-object duck check ---
  if (isGeneratorObj(val)) return 'generator';

  // --- F. Object.prototype.toString tail dispatch ---
  var tag = toString.call(val);
  switch (tag) {
    case '[object Object]':          return 'object';
    case '[object Map Iterator]':    return 'mapiterator';
    case '[object Set Iterator]':    return 'setiterator';
    case '[object String Iterator]': return 'stringiterator';
    case '[object Array Iterator]':  return 'arrayiterator';
  }

  // --- G. final tail-slice fallback ---
  return tag.slice(8, -1).toLowerCase().replace(/\s/g, '');
}
