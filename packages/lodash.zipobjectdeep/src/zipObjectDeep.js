// @rederive/zipObjectDeep — verified-recompose of lodash.zipobjectdeep@4.18.0. quorum 3/3, differential 400/400, round 1. SIR: sir/zipObjectDeep.sir
// zipObjectDeep — clean-room re-emission from SIR
// PROVENANCE: lodash.zipobjectdeep@4.18.0 (MIT)

const MAX_SAFE_INTEGER = 9007199254740991;

// NODE 9 support predicates
function isArray(v) {
  return Array.isArray(v);
}

function isObject(v) {
  if (v == null) return false;
  const t = typeof v;
  return t === 'object' || t === 'function';
}

function isObjectLike(v) {
  return v != null && typeof v === 'object';
}

function isSymbol(v) {
  if (typeof v === 'symbol') return true;
  if (!isObjectLike(v)) return false;
  return Object.prototype.toString.call(v) === '[object Symbol]';
}

// NODE 7: isIndex
const reIsUint = /^(?:0|[1-9]\d*)$/;

function isIndex(value) {
  const type = typeof value;
  // length arg is always MAX_SAFE_INTEGER here (never passed)
  const length = MAX_SAFE_INTEGER;
  if (!length) return false;
  if (type === 'number') {
    return value > -1 && value % 1 === 0 && value < length;
  }
  if (type === 'symbol') return false;
  // string (or other non-symbol non-number)
  if (!reIsUint.test(value)) return false;
  const num = +value;
  return num > -1 && num % 1 === 0 && num < length;
}

// NODE 6: toKey
function toKey(value) {
  if (typeof value === 'string' || isSymbol(value)) return value;
  const result = value + '';
  return (result === '0' && (1 / value) === -Infinity) ? '-0' : result;
}

// NODE 8: stringToPath
const rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
const reEscapeChar = /\\(\\)?/g;

function stringToPath(string) {
  const result = [];
  if (string.charCodeAt(0) === 46) {
    // leading '.' -> push empty first key
    result.push('');
  }
  string.replace(rePropName, function(match, number, quote, subString) {
    result.push(
      quote
        ? subString.replace(reEscapeChar, '$1')
        : (number !== undefined ? number : match)
    );
  });
  return result;
}

// NODE 9: toString / baseToString
function baseToString(v) {
  if (typeof v === 'string') return v;
  if (isArray(v)) {
    return v.map(baseToString).join(',');
  }
  if (isSymbol(v)) {
    return (typeof v.toString === 'function') ? v.toString() : '';
  }
  const result = v + '';
  return (result === '0' && (1 / v) === -Infinity) ? '-0' : result;
}

function toString(v) {
  return v == null ? '' : baseToString(v);
}

// NODE 4: isKey
const reIsPlainProp = /^\w*$/;
const reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/;

function isKey(value, object) {
  if (isArray(value)) return false;
  const type = typeof value;
  if (
    type === 'number' ||
    type === 'symbol' ||
    type === 'boolean' ||
    value == null ||
    isSymbol(value)
  ) {
    return true;
  }
  return (
    reIsPlainProp.test(value) ||
    !reIsDeepProp.test(value) ||
    (object != null && value in Object(object))
  );
}

// NODE 3: castPath
function castPath(value, object) {
  if (isArray(value)) return value;
  if (isKey(value, object)) return [value];
  return stringToPath(toString(value));
}

// NODE 5: assignValue / eq / baseAssignValue
function eq(a, b) {
  return a === b || (a !== a && b !== b);
}

function baseAssignValue(object, key, value) {
  if (key === '__proto__') {
    // use defineProperty if available
    if (Object.defineProperty) {
      Object.defineProperty(object, key, {
        configurable: true,
        enumerable: true,
        value: value,
        writable: true,
      });
    } else {
      object[key] = value;
    }
  } else {
    object[key] = value;
  }
}

function assignValue(object, key, value) {
  const objValue = object[key];
  if (
    !(Object.prototype.hasOwnProperty.call(object, key) && eq(objValue, value)) ||
    (value === undefined && !(key in object))
  ) {
    baseAssignValue(object, key, value);
  }
}

// NODE 2: baseSet
function baseSet(object, path, value) {
  if (!isObject(object)) return object;

  const pathArray = castPath(path, object);

  let index = -1;
  const length = pathArray.length;
  const lastIndex = length - 1;
  let nested = object;

  while (nested != null && ++index < length) {
    const key = toKey(pathArray[index]);
    let newValue = value;

    // PROTOTYPE-POLLUTION GUARD
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return object;
    }

    if (index !== lastIndex) {
      // intermediate key: ensure container exists
      const objValue = nested[key];
      // customizer never passed, so always undefined
      newValue = undefined;
      if (newValue === undefined) {
        newValue = isObject(objValue)
          ? objValue
          : (isIndex(pathArray[index + 1]) ? [] : {});
      }
    }

    assignValue(nested, key, newValue);
    nested = nested[key];
  }

  return object;
}

// NODE 1 + NODE 0: the main function
function zipObjectDeep(props, values) {
  // NODE 0: nullish coalescing
  props  = props  || [];
  values = values || [];

  // NODE 1: zip loop
  const result = {};
  const length = props.length;
  const valsLength = values.length;

  for (let index = 0; index < length; index++) {
    const value = index < valsLength ? values[index] : undefined;
    baseSet(result, props[index], value);
  }

  return result;
}

export default zipObjectDeep;
