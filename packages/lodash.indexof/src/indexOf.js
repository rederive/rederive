// @rederive/indexOf — verified-recompose of lodash.indexof@4.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/indexOf.sir
// Clean-room re-emission of lodash.indexof@4.0.1 indexOf
// Reconstructed from SIR contract + frozen oracle only.

const INFINITY = Infinity;
const MAX_INTEGER = 1.7976931348623157e+308;

function isObject(value) {
  const type = typeof value;
  return !!value && (type === 'object' || type === 'function');
}

function isFunction(value) {
  return typeof value === 'function';
}

function toNumber(value) {
  // Step N1: object coercion
  if (isObject(value)) {
    const other = isFunction(value.valueOf) ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  // Step N2: non-string
  if (typeof value !== 'string') {
    return value === 0 ? value : +value;
  }
  // Step N3: string processing
  value = value.replace(/^\s+|\s+$/g, '');
  const isBinary = /^0b[01]+$/i.test(value);
  if (isBinary || /^0o[0-7]+$/i.test(value)) {
    return parseInt(value.slice(2), isBinary ? 2 : 8);
  }
  if (/^[-+]0x[0-9a-f]+$/i.test(value)) {
    return NaN;
  }
  return +value;
}

function toInteger(value) {
  // Step T1: falsy short-circuit
  if (!value) {
    return value === 0 ? value : 0;
  }
  // Step T2: coerce to number
  value = toNumber(value);
  // Step T3: infinity handling
  if (value === INFINITY || value === -INFINITY) {
    const sign = value < 0 ? -1 : 1;
    return sign * MAX_INTEGER;
  }
  // Step T4: truncate toward zero, NaN → 0
  const remainder = value % 1;
  return value === value ? (remainder ? value - remainder : value) : 0;
}

function indexOfNaN(array, fromIndex) {
  const length = array.length;
  let index = fromIndex + (-1); // fromRight is falsy → -1
  while (++index < length) {
    const other = array[index];
    if (other !== other) return index;
  }
  return -1;
}

function baseIndexOf(array, value, fromIndex) {
  // Branch B1: NaN search
  if (value !== value) {
    return indexOfNaN(array, fromIndex);
  }
  // Branch B2: strict equality scan
  let index = fromIndex - 1;
  const length = array.length;
  while (++index < length) {
    if (array[index] === value) return index;
  }
  return -1;
}

function indexOf(array, value, fromIndex) {
  // Node 1: length resolution + empty/nullish short-circuit
  const length = array ? array.length : 0;
  if (!length) return -1;

  // Node 2: coerce fromIndex via toInteger
  fromIndex = toInteger(fromIndex);

  // Node 3: negative-wrap
  if (fromIndex < 0) {
    fromIndex = Math.max(length + fromIndex, 0);
  }

  // Node 4: delegate to baseIndexOf
  return baseIndexOf(array, value, fromIndex);
}

export default indexOf;
