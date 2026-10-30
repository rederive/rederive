// @rederive/toNumber — verified-recompose of lodash.tonumber@4.18.0. quorum 3/3, differential 400/400, round 1. SIR: sir/toNumber.sir
// Clean-room re-emission of lodash.tonumber@4.18.0 toNumber
// Reconstructed strictly from the SIR behavioral spec.

var NAN = 0 / 0;
var symbolTag = '[object Symbol]';

var reTrimStart = /^\s+/;
var reWhitespace = /\s/;
var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
var reIsBinary = /^0b[01]+$/i;
var reIsOctal = /^0o[0-7]+$/i;

var freeParseInt = parseInt;

function baseGetTag(value) {
  if (value == null) {
    return value === undefined ? '[object Undefined]' : '[object Null]';
  }
  if (typeof Symbol !== 'undefined' && Symbol.toStringTag && Symbol.toStringTag in Object(value)) {
    return getRawTag(value);
  }
  return Object.prototype.toString.call(value);
}

function getRawTag(value) {
  var isOwn = Object.prototype.hasOwnProperty.call(value, Symbol.toStringTag);
  var tag = value[Symbol.toStringTag];
  try {
    value[Symbol.toStringTag] = undefined;
    var unmasked = true;
  } catch (e) {}
  var result = Object.prototype.toString.call(value);
  if (unmasked) {
    if (isOwn) {
      value[Symbol.toStringTag] = tag;
    } else {
      delete value[Symbol.toStringTag];
    }
  }
  return result;
}

function isObjectLike(value) {
  return value != null && typeof value == 'object';
}

function isSymbol(value) {
  return (typeof value == 'symbol') ||
    (isObjectLike(value) && baseGetTag(value) == symbolTag);
}

function isObject(value) {
  var type = typeof value;
  return value != null && (type == 'object' || type == 'function');
}

function trimmedEndIndex(s) {
  var index = s.length;
  while (index-- && reWhitespace.test(s.charAt(index))) {}
  return index;
}

function baseTrim(s) {
  return s ? s.slice(0, trimmedEndIndex(s) + 1).replace(reTrimStart, '') : s;
}

function toNumber(value) {
  // NODE 1: number fast-path — FIRST, before anything else
  if (typeof value == 'number') {
    return value;
  }

  // NODE 2: symbol -> NaN
  if (isSymbol(value)) {
    return NAN;
  }

  // NODE 3: object unwrap to primitive
  if (isObject(value)) {
    var other = (typeof value.valueOf == 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }

  // NODE 4: non-string -> numeric coercion with -0 guard
  if (typeof value != 'string') {
    return value === 0 ? value : +value;
  }

  // NODE 5: string path
  value = baseTrim(value);
  var isBinary = reIsBinary.test(value);
  return (isBinary || reIsOctal.test(value))
    ? freeParseInt(value.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex.test(value) ? NAN : +value);
}

export default toNumber;
