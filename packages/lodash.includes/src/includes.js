// @rederive/includes — verified-recompose of lodash.includes@4.3.0. quorum 3/3, differential 400/400, round 1. SIR: sir/includes.sir
// Clean-room re-emission of lodash.includes@4.3.0
// Reconstructed from SIR contract and frozen oracle. No original source consulted.

const INFINITY = Infinity;
const MAX_SAFE_INTEGER = 9007199254740991;
const MAX_INTEGER = 1.7976931348623157e+308;
const NAN = NaN;
const stringTag = '[object String]';
const symbolTag = '[object Symbol]';
const argsTag = '[object Arguments]';
const funcTag = '[object Function]';
const genTag = '[object GeneratorFunction]';
const reTrim = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;
const reIsUint = /^(?:0|[1-9]\d*)$/;

const objectProto = Object.prototype;
const hasOwnProperty = objectProto.hasOwnProperty;
const toString = objectProto.toString;

function isObject(value) {
  const type = typeof value;
  return value != null && (type === 'object' || type === 'function');
}

function isObjectLike(value) {
  return value != null && typeof value === 'object';
}

function isFunction(value) {
  if (!isObject(value)) return false;
  const tag = toString.call(value);
  return tag === funcTag || tag === genTag;
}

function isLength(value) {
  return typeof value === 'number' &&
    value > -1 &&
    value % 1 === 0 &&
    value <= MAX_SAFE_INTEGER;
}

function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

function isArrayLikeObject(value) {
  return isObjectLike(value) && isArrayLike(value);
}

function isArray(value) {
  return Array.isArray(value);
}

function isString(value) {
  return typeof value === 'string' ||
    (!isArray(value) && isObjectLike(value) && toString.call(value) === stringTag);
}

function isSymbol(value) {
  return typeof value === 'symbol' ||
    (isObjectLike(value) && toString.call(value) === symbolTag);
}

// isPrototype: checks if value is a prototype object
const Ctor = Object;
const proto = Ctor.prototype;
function isPrototype(value) {
  const Ctor = value && value.constructor;
  const ctorProto = (typeof Ctor === 'function' && Ctor.prototype) || proto;
  return value === ctorProto;
}

function isIndex(value, length) {
  const type = typeof value;
  length = length == null ? MAX_SAFE_INTEGER : length;
  return !!length &&
    (type === 'number' ||
      (type !== 'symbol' && reIsUint.test(value))) &&
    (value > -1 && value % 1 === 0 && value < length);
}

function baseTimes(n, iteratee) {
  let index = -1;
  const result = Array(n);
  while (++index < n) {
    result[index] = iteratee(index);
  }
  return result;
}

function arrayLikeKeys(value, inherited) {
  const isArr = isArray(value);
  const isArg = !isArr && isArguments(value);
  const isBuff = false; // no Buffer handling needed
  const isType = !isArr && !isArg && false; // no TypedArray
  const skipIndexes = isArr || isArg || isBuff || isType;
  const result = skipIndexes ? baseTimes(value.length, String) : [];
  const length = result.length;

  for (const key in value) {
    if ((inherited || hasOwnProperty.call(value, key)) &&
        !(skipIndexes && (
          // Safari 9 has enumerable `arguments.length` in strict mode.
          key === 'length' ||
          // Node.js 0.10 has enumerable non-index properties on buffers.
          (isBuff && (key === 'offset' || key === 'parent')) ||
          // PhantomJS 2 has enumerable non-index properties on typed arrays.
          (isType && (key === 'buffer' || key === 'byteLength' || key === 'byteOffset')) ||
          // Skip index properties.
          isIndex(key, length)
        ))) {
      result.push(key);
    }
  }
  return result;
}

function isArguments(value) {
  return isObjectLike(value) && toString.call(value) === argsTag;
}

function baseKeys(object) {
  if (!isPrototype(object)) {
    return Object.keys(object);
  }
  const result = [];
  for (const key in Object(object)) {
    if (hasOwnProperty.call(object, key) && key !== 'constructor') {
      result.push(key);
    }
  }
  return result;
}

function keys(object) {
  return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
}

function arrayMap(array, iteratee) {
  let index = -1;
  const length = array == null ? 0 : array.length;
  const result = Array(length);
  while (++index < length) {
    result[index] = iteratee(array[index], index, array);
  }
  return result;
}

function baseValues(object, props) {
  return arrayMap(props, function(key) {
    return object[key];
  });
}

function values(object) {
  if (object == null) {
    return [];
  }
  return baseValues(object, keys(object));
}

function toNumber(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (isSymbol(value)) {
    return NAN;
  }
  if (isObject(value)) {
    const other = typeof value.valueOf === 'function' ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value !== 'string') {
    return (value === 0 ? value : +value);
  }
  value = value.replace(reTrim, '');
  const isBinary = reIsBinary.test(value);
  if (isBinary || reIsOctal.test(value)) {
    return parseInt(value.slice(2), isBinary ? 2 : 8);
  }
  if (reIsBadHex.test(value)) {
    return NAN;
  }
  return +value;
}

function toFinite(value) {
  if (!value) {
    return value === 0 ? value : 0;
  }
  value = toNumber(value);
  if (value === INFINITY || value === -INFINITY) {
    const sign = (value < 0) ? -1 : 1;
    return sign * MAX_INTEGER;
  }
  return value === value ? value : 0;
}

function toInteger(value) {
  const result = toFinite(value);
  const remainder = result % 1;
  return (result === result) ? (remainder ? result - remainder : result) : 0;
}

function baseIsNaN(value) {
  return value !== value;
}

function baseFindIndex(array, predicate, fromIndex, fromRight) {
  const length = array.length;
  let index = fromIndex + (fromRight ? 1 : -1);
  while ((fromRight ? index-- : ++index < length)) {
    if (predicate(array[index], index, array)) {
      return index;
    }
  }
  return -1;
}

function baseIndexOf(array, value, fromIndex) {
  if (value !== value) {
    // value is NaN
    return baseFindIndex(array, baseIsNaN, fromIndex);
  }
  let index = fromIndex - 1;
  const length = array.length;
  while (++index < length) {
    if (array[index] === value) {
      return index;
    }
  }
  return -1;
}

function includes(collection, value, fromIndex, guard) {
  // NODE 1: normalize collection into an indexable sequence
  collection = isArrayLike(collection) ? collection : values(collection);

  // NODE 2: normalize fromIndex
  fromIndex = (fromIndex && !guard) ? toInteger(fromIndex) : 0;

  // NODE 3: capture length
  const length = collection.length;

  // NODE 4: clamp negative fromIndex
  if (fromIndex < 0) {
    fromIndex = Math.max(length + fromIndex, 0);
  }

  // NODE 5: search
  return isString(collection)
    ? (fromIndex <= length && collection.indexOf(value, fromIndex) > -1)
    : (!!length && baseIndexOf(collection, value, fromIndex) > -1);
}

export default includes;
export { includes };
