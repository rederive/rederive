// @rederive/clamp — verified-recompose of lodash.clamp@4.0.3. quorum 3/3, differential 400/400, round 1. SIR: sir/clamp.sir
// Clean-room re-emission of lodash.clamp@4.0.3 — ES module default export.
// Reconstructed purely from the SIR behavioral contract.

var NAN = 0 / 0;
var reTrim = /^\s+|\s+$/g;
var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
var reIsBinary = /^0b[01]+$/i;
var reIsOctal = /^0o[0-7]+$/i;
var symbolTag = '[object Symbol]';
var objectToString = Object.prototype.toString;
var freeParseInt = parseInt;

function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) == symbolTag);
}

function toNumber(value) {
  // T1: numbers pass through (including -0, NaN, ±Infinity)
  if (typeof value == 'number') {
    return value;
  }
  // T2: Symbol (primitive or object) -> NaN
  if (isSymbol(value)) {
    return NAN;
  }
  // T3: objects (including arrays, functions, boxed primitives)
  if (isObject(value)) {
    var other = (typeof value.valueOf == 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  // T4: non-string primitives (after possible T3 unwrap)
  if (typeof value != 'string') {
    return (value === 0) ? value : (+value);
  }
  // T5: string processing
  value = value.replace(reTrim, '');
  var isBinary = reIsBinary.test(value);
  if (isBinary || reIsOctal.test(value)) {
    return freeParseInt(value.slice(2), isBinary ? 2 : 8);
  } else {
    return reIsBadHex.test(value) ? NAN : (+value);
  }
}

function baseClamp(number, lower, upper) {
  // B5: NaN short-circuit — if number is NaN, skip all clamping
  if (number === number) {
    if (upper !== undefined) {
      number = (number <= upper) ? number : upper;
    }
    if (lower !== undefined) {
      number = (number >= lower) ? number : lower;
    }
  }
  return number;
}

function clamp(number, lower, upper) {
  // BRANCH A: arity normalization — 2-arg vs 3-arg detection
  if (upper === undefined) {
    upper = lower;
    lower = undefined;
  }

  // BRANCH B: bound coercion with NaN->0 substitution
  if (upper !== undefined) {
    upper = toNumber(upper);
    upper = (upper === upper) ? upper : 0;
  }
  if (lower !== undefined) {
    lower = toNumber(lower);
    lower = (lower === lower) ? lower : 0;
  }

  // BRANCH C: clamp — number coerced by toNumber, no NaN->0 substitution
  return baseClamp(toNumber(number), lower, upper);
}

export default clamp;
