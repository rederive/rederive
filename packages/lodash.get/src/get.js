// @rederive/get — verified-recompose of lodash.get@4.4.2. quorum 3/3, differential 400/400, round 1. SIR: sir/get.sir
// Blind clean-room re-emission of lodash.get@4.4.2
// Reconstructed from SIR spec and frozen oracle only.

const INFINITY = 1 / 0;
const symbolTag = '[object Symbol]';

const reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/;
const reIsPlainProp = /^\w*$/;
const reLeadingDot = /^\./;
const rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
const reEscapeChar = /\\(\\)?/g;

function isArray(value) {
  return Array.isArray(value);
}

function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && Object.prototype.toString.call(value) == symbolTag);
}

function baseToString(value) {
  if (typeof value == 'string') {
    return value;
  }
  if (isSymbol(value)) {
    return (typeof Symbol != 'undefined' && Symbol.prototype.toString)
      ? Symbol.prototype.toString.call(value)
      : '';
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

function toString(value) {
  if (value == null) {
    return '';
  }
  return baseToString(value);
}

function isKey(value, object) {
  if (isArray(value)) {
    return false;
  }
  var type = typeof value;
  if (type == 'number' || type == 'symbol' || type == 'boolean' ||
      value == null || isSymbol(value)) {
    return true;
  }
  return reIsPlainProp.test(value) ||
    !reIsDeepProp.test(value) ||
    (object != null && value in Object(object));
}

function toKey(value) {
  if (typeof value == 'string' || isSymbol(value)) {
    return value;
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

function stringToPath(string) {
  string = toString(string);
  var result = [];
  if (reLeadingDot.test(string)) {
    result.push('');
  }
  string.replace(rePropName, function(match, number, quote, str) {
    result.push(quote ? str.replace(reEscapeChar, '$1') : (number || match));
  });
  return result;
}

function castPath(value) {
  return isArray(value) ? value : stringToPath(value);
}

function baseGet(object, path) {
  path = isKey(path, object) ? [path] : castPath(path);
  var index = 0;
  var length = path.length;
  while (object != null && index < length) {
    object = object[toKey(path[index++])];
  }
  return (index && index == length) ? object : undefined;
}

function get(object, path, defaultValue) {
  var result = object == null ? undefined : baseGet(object, path);
  return result === undefined ? defaultValue : result;
}

export default get;
