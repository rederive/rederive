// @rederive/toInteger — verified-recompose of lodash.tointeger@4.0.4. quorum 3/3, differential 400/400, round 1. SIR: sir/toInteger.sir
// Clean-room re-emission of lodash.tointeger@4.0.4
// Reconstructed from toInteger.sir + frozen.md — zero runtime deps

const INFINITY = 1 / 0;
const MAX_INTEGER = 1.7976931348623157e+308;
const NAN = 0 / 0;
const symbolTag = '[object Symbol]';
const reTrim = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;
const freeParseInt = parseInt;

function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

function isObject(value) {
  if (!value) return false;
  const type = typeof value;
  return type == 'object' || type == 'function';
}

function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && Object.prototype.toString.call(value) == symbolTag);
}

function toNumber(value) {
  // STAGE C — only called from toFinite with truthy value
  // Step 1: number passes straight through
  if (typeof value == 'number') return value;

  // Step 2: symbols -> NaN
  if (isSymbol(value)) return NAN;

  // Step 3: objects -> coerce via valueOf/toString
  if (isObject(value)) {
    const other = (typeof value.valueOf == 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }

  // Step 4: non-string primitive
  if (typeof value != 'string') {
    return value === 0 ? value : +value;
    // Note: non-zero bigint here causes +bigint to throw TypeError — that's correct behavior
  }

  // Step 5: string path
  value = value.replace(reTrim, '');
  const isBinary = reIsBinary.test(value);
  if (isBinary || reIsOctal.test(value)) {
    return freeParseInt(value.slice(2), isBinary ? 2 : 8);
  } else if (reIsBadHex.test(value)) {
    return NAN;
  } else {
    return +value;
  }
}

function toFinite(value) {
  // STAGE B
  // Step 1: falsy short-circuit
  if (!value) {
    return value === 0 ? value : 0;
  }

  // Step 2: coerce to number
  value = toNumber(value);

  // Step 3: clamp infinities
  if (value === INFINITY || value === -INFINITY) {
    const sign = value < 0 ? -1 : 1;
    return sign * MAX_INTEGER;
  }

  // Step 4: NaN -> 0, finite -> itself
  return value === value ? value : 0;
}

function toInteger(value) {
  // STAGE A
  const result = toFinite(value);
  const remainder = result % 1;

  if (result === result) {
    // result is not NaN (toFinite never returns NaN, but reproduce the check)
    if (remainder) {
      // truthy remainder means fractional part — truncate toward zero
      return result - remainder;
    } else {
      // already integral (includes +0, -0, ±MAX_INTEGER) — return unchanged
      return result;
    }
  } else {
    return 0;
  }
}

export default toInteger;
