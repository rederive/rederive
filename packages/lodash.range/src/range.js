// @rederive/range — verified-recompose of lodash.range@3.2.0. quorum 3/3, differential 400/400, round 1. SIR: sir/range.sir
// Clean-room re-emission of lodash.range@3.2.0 — reconstructed from SIR contract only.
// No original source consulted.

const MAX_INTEGER = 1.7976931348623157e+308;

function isObject(value) {
  const type = typeof value;
  return value != null && (type == 'object' || type == 'function');
}

function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObject(value) && Object.prototype.toString.call(value) == '[object Symbol]');
}

function toNumber(value) {
  if (typeof value == 'number') return value;
  if (isSymbol(value)) return NaN;
  if (isObject(value)) {
    var other = (typeof value.valueOf == 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value != 'string') return value === 0 ? value : +value;
  value = value.replace(/^\s+|\s+$/g, '');
  var isBinary = /^0b[01]+$/i.test(value);
  if (isBinary || /^0o[0-7]+$/i.test(value)) {
    return parseInt(value.slice(2), isBinary ? 2 : 8);
  }
  return /^[-+]0x[0-9a-f]+$/i.test(value) ? NaN : +value;
}

function toFinite(value) {
  if (!value) return value === 0 ? value : 0;
  value = toNumber(value);
  if (value === Infinity || value === -Infinity) {
    return (value < 0 ? -1 : 1) * MAX_INTEGER;
  }
  return value === value ? value : 0;
}

function isIterateeCall(value, index, object) {
  if (!isObject(object)) return false;
  var type = typeof index;
  if (type == 'number'
        ? (isObject(object) && index in Object(object))
        : (type == 'string' && index in Object(object))) {
    var other = object[index];
    return value === other || (value !== value && other !== other);
  }
  return false;
}

function baseRange(start, end, step, fromRight) {
  var index = -1,
      length = Math.max(Math.ceil((end - start) / (step || 1)), 0),
      result = Array(length);

  while (length--) {
    result[fromRight ? length : ++index] = start;
    start += step;
  }
  return result;
}

function range(start, end, step) {
  // NODE 1: iteratee-call guard
  if (step && typeof step != 'number' && isIterateeCall(start, end, step)) {
    end = step = undefined;
  }

  // NODE 2: start coercion
  start = toFinite(start);

  // NODE 3: end defaulting (1-arg vs >=2-arg shift)
  if (end === undefined) {
    end = start;
    start = 0;
  } else {
    end = toFinite(end);
  }

  // NODE 4: step derivation
  step = (step === undefined) ? (start < end ? 1 : -1) : toFinite(step);

  // NODE 5: return baseRange (fromRight is undefined -> falsy -> left-to-right)
  return baseRange(start, end, step, undefined);
}

export default range;
