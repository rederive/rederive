// @rederive/at — verified-recompose of lodash.at@4.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/at.sir
// Reconstructed from SIR contract: lodash.at@4.0.0
// Self-contained ES module — no external imports.

// ---------------------------------------------------------------------------
// Supporting predicates
// ---------------------------------------------------------------------------

function isArray(v) {
  return Array.isArray(v);
}

function isObjectLike(v) {
  return !!v && typeof v === 'object';
}

function isSymbol(v) {
  return typeof v === 'symbol' ||
    (isObjectLike(v) && Object.prototype.toString.call(v) === '[object Symbol]');
}

// ---------------------------------------------------------------------------
// toString / baseToString
// ---------------------------------------------------------------------------

function baseToString(value) {
  if (typeof value === 'string') return value;
  if (isSymbol(value)) {
    // Symbol.prototype.toString, or "" if unavailable
    return (typeof Symbol !== 'undefined' && Symbol.prototype && Symbol.prototype.toString)
      ? Symbol.prototype.toString.call(value)
      : '';
  }
  var result = (value + '');
  // -0 special case
  return (result === '0' && (1 / value) === -Infinity) ? '-0' : result;
}

function toString(value) {
  return value == null ? '' : baseToString(value);
}

// ---------------------------------------------------------------------------
// toKey
// ---------------------------------------------------------------------------

function toKey(value) {
  if (typeof value === 'string' || isSymbol(value)) return value;
  var result = (value + '');
  return (result === '0' && (1 / value) === -Infinity) ? '-0' : result;
}

// ---------------------------------------------------------------------------
// isKey
// ---------------------------------------------------------------------------

var reIsPlainProp = /^\w*$/;
var reIsDeepProp  = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/;

function isKey(value, object) {
  if (isArray(value)) return false;
  var type = typeof value;
  if (type === 'number' || type === 'symbol' || type === 'boolean' ||
      value == null || isSymbol(value)) {
    return true;
  }
  // string (or string-coercible non-array object)
  return reIsPlainProp.test(value) ||
    !reIsDeepProp.test(value) ||
    (object != null && value in Object(object));
}

// ---------------------------------------------------------------------------
// stringToPath
// ---------------------------------------------------------------------------

var reLeadingDot = /^\./;
var rePropName   = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
var reEscapeChar = /\\(\\)?/g;

function stringToPath(string) {
  string = toString(string);
  var result = [];
  if (reLeadingDot.test(string)) {
    result.push('');
  }
  string.replace(rePropName, function(match, number, quote, str) {
    result.push(quote ? str.replace(reEscapeChar, '$1') : (number !== undefined ? number : match));
  });
  return result;
}

// ---------------------------------------------------------------------------
// castPath
// ---------------------------------------------------------------------------

function castPath(value) {
  return isArray(value) ? value : stringToPath(value);
}

// ---------------------------------------------------------------------------
// baseGet
// ---------------------------------------------------------------------------

function baseGet(object, path) {
  if (isKey(path, object)) {
    path = [path];
  } else {
    path = castPath(path);
  }
  var index = 0;
  var length = path.length;
  while (object != null && index < length) {
    object = object[toKey(path[index])];
    index++;
  }
  // returns undefined if path was empty (length 0 -> index stays 0, condition false)
  // OR if a null/undefined was hit before consuming the whole path
  return (index !== 0 && index === length) ? object : undefined;
}

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

function get(object, path) {
  if (object == null) return undefined;
  var result = baseGet(object, path);
  return result === undefined ? undefined : result;
}

// ---------------------------------------------------------------------------
// baseFlatten  (depth=undefined -> no flattening; shallow copy only)
// ---------------------------------------------------------------------------

function baseFlatten(array) {
  // depth is undefined; (undefined > 0) === false so flatten branch never taken
  // isStrict is undefined (falsy) so else-branch (push as-is) always taken
  var result = [];
  for (var i = 0; i < array.length; i++) {
    result[result.length] = array[i];
  }
  return result;
}

// ---------------------------------------------------------------------------
// baseAt
// ---------------------------------------------------------------------------

function baseAt(object, paths) {
  var isNil = object == null;
  var length = paths.length;
  var result = new Array(length);
  for (var index = 0; index < length; index++) {
    result[index] = isNil ? undefined : get(object, paths[index]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// at  (rest-wrapped: start = 1)
// ---------------------------------------------------------------------------

function at(object) {
  // Collect all arguments after the first into a paths array
  var paths = [];
  for (var i = 1; i < arguments.length; i++) {
    paths[paths.length] = arguments[i];
  }
  return baseAt(object, baseFlatten(paths));
}

export default at;
