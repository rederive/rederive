// @rederive/assign — verified-recompose of lodash.assign@4.2.0. quorum 3/3, differential 400/400, round 1. SIR: sir/assign.sir
// Clean-room reconstruction of lodash.assign@4.2.0
// Reconstructed from SIR contract + frozen oracle only.

function isObject(value) {
  const type = typeof value;
  return value != null && (type === 'object' || type === 'function');
}

function isArrayLike(value) {
  if (value == null) return false;
  if (typeof value === 'function') return false;
  const len = value.length;
  return typeof len === 'number' && len >= 0 && len <= (2 ** 53 - 1) && Number.isInteger(len);
}

function isIndex(value, length) {
  // An array index: non-negative integer < length
  if (typeof value !== 'number') return false;
  return Number.isInteger(value) && value >= 0 && value < length;
}

function sameValueZero(a, b) {
  return a === b || (a !== a && b !== b);
}

function arrayLikeKeys(source) {
  const keys = [];
  const len = source.length;
  // Add numeric index keys "0".."length-1"
  for (let i = 0; i < len; i++) {
    keys.push(String(i));
  }
  // Add any other own enumerable string keys that are NOT an array index and NOT "length"
  const ownKeys = Object.keys(source);
  for (const key of ownKeys) {
    if (key === 'length') continue;
    // Check if it's an integer index already added
    const num = Number(key);
    if (Number.isInteger(num) && num >= 0 && num < len && String(num) === key) continue;
    keys.push(key);
  }
  return keys;
}

function assignValue(object, key, value) {
  const objValue = object[key];
  const hasOwn = Object.prototype.hasOwnProperty.call(object, key);
  // Write unless: object already owns key AND SameValueZero(objValue, value)
  // Exception: if value === undefined AND key is NOT in object, still write
  const shouldSkip = hasOwn && sameValueZero(objValue, value)
    && !(value === undefined && !(key in object));
  if (!shouldSkip) {
    object[key] = value;
  }
}

function isIterateeCall(value, index, obj) {
  if (!isObject(obj)) return false;
  const t = typeof index;
  if (t === 'number') {
    return isArrayLike(obj) && isIndex(index, obj.length) && sameValueZero(obj[index], value);
  } else if (t === 'string') {
    return (index in obj) && sameValueZero(obj[index], value);
  }
  return false;
}

function assign(object, ...sources) {
  // node-1: COERCE-DESTINATION
  const dest = Object(object);

  // node-GUARD: isIterateeCall short-circuit
  let length = sources.length;
  const guard = length > 2 ? sources[2] : undefined;
  if (guard !== undefined && isIterateeCall(sources[0], sources[1], guard)) {
    length = 1;
  }

  // node-2: ITERATE SOURCES
  for (let i = 0; i < length; i++) {
    const source = sources[i];

    // node-2a: SKIP-FALSY-SOURCE
    if (!source) continue;

    // node-2b: COPY OWN ENUMERABLE STRING KEYS
    if (isArrayLike(source) && typeof source !== 'function') {
      const keys = arrayLikeKeys(source);
      for (const key of keys) {
        assignValue(dest, key, source[key]);
      }
    } else {
      for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          assignValue(dest, key, source[key]);
        }
      }
    }
  }

  // node-3: RETURN
  return dest;
}

export default assign;
