// @rederive/flattenDepth — verified-recompose of lodash.flattendepth@4.7.0. quorum 3/3, differential 400/400, round 1. SIR: sir/flattenDepth.sir
// Clean-room re-emission of flattenDepth (lodash.flattendepth@4.7.0)
// Reconstructed purely from the SIR contract and frozen oracle.

const MAX_INTEGER = 1.7976931348623157e+308;
const spreadableSymbol = typeof Symbol !== 'undefined' ? Symbol.isConcatSpreadable : undefined;

// NODE 8 — toNumber(value)
function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'symbol') return NaN;
  if (value !== null && typeof value === 'object' || typeof value === 'function') {
    const other = (typeof value.valueOf === 'function') ? value.valueOf() : value;
    value = (other !== null && typeof other === 'object' || typeof other === 'function')
      ? (other + '')
      : other;
  }
  if (typeof value !== 'string') return value === 0 ? value : +value;
  // TRIM leading/trailing whitespace
  value = value.replace(/^\s+|\s+$/g, '');
  const isBinary = /^0b[01]+$/i.test(value);
  if (isBinary || /^0o[0-7]+$/i.test(value)) {
    return parseInt(value.slice(2), isBinary ? 2 : 8);
  }
  if (/^[-+]0x[0-9a-f]+$/i.test(value)) return NaN; // signed hex -> NaN
  return +value;
}

// NODE 7 — toFinite(value)
function toFinite(value) {
  if (!value) return value === 0 ? value : 0;
  value = toNumber(value);
  if (value === Infinity || value === -Infinity) {
    const sign = value < 0 ? -1 : 1;
    return sign * MAX_INTEGER;
  }
  return value === value ? value : 0;
}

// NODE 6 — toInteger(value)
function toInteger(value) {
  const result = toFinite(value);
  const remainder = result % 1;
  return (result === result)
    ? (remainder ? result - remainder : result)
    : 0;
}

// NODE 5 — isFlattenable(value)
function isFlattenable(value) {
  return Array.isArray(value)
    || isArguments(value)
    || !!(spreadableSymbol && value && value[spreadableSymbol]);
}

// isArguments: a JS arguments object has own 'callee' property
function isArguments(value) {
  return value !== null && typeof value === 'object'
    && Object.prototype.hasOwnProperty.call(value, 'callee')
    && !Object.prototype.propertyIsEnumerable.call(value, 'callee');
}

// NODE 4 — baseFlatten(array, depth, predicate, isStrict, result)
// Called from flattenDepth with only array+depth; predicate=isFlattenable, isStrict=false, result=[]
function baseFlatten(array, depth, predicate, isStrict, result) {
  if (predicate === undefined) predicate = isFlattenable;
  if (result === undefined) result = [];

  const length = array == null ? 0 : array.length;
  let index = -1;

  while (++index < length) {
    const value = array[index];
    if (depth > 0 && predicate(value)) {
      if (depth > 1) {
        // recurse: flatten value one level shallower, appending into the SAME result
        baseFlatten(value, depth - 1, predicate, isStrict, result);
      } else {
        // depth === 1: arrayPush — append each element of value without further flattening
        const valLen = value == null ? 0 : value.length;
        let j = -1;
        while (++j < valLen) {
          result[result.length] = value[j];
        }
      }
    } else {
      // not flattenable, or depth <= 0: push value itself
      result[result.length] = value;
    }
  }
  return result;
}

// Main — flattenDepth(array, depth)
function flattenDepth(array, depth) {
  // NODE 1 — empty/degenerate guard (runs BEFORE any depth coercion)
  const length = array ? array.length : 0;
  if (!length) return [];

  // NODE 2 — depth resolution
  depth = (depth === undefined) ? 1 : toInteger(depth);

  // NODE 3 — flatten
  return baseFlatten(array, depth);
}

export default flattenDepth;
