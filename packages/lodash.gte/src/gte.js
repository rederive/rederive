// @rederive/gte — verified-recompose of lodash.gte@3.9.2. quorum 3/3, differential 400/400, round 1. SIR: sir/gte.sir
// Clean-room re-emission of lodash.gte@3.9.2 — from SIR contract only.
// export default gte(value, other) -> boolean

const NAN = 0 / 0;
const reTrim = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;
const symbolTag = '[object Symbol]';

function isObjectLike(value) {
  return value !== null && typeof value === 'object';
}

function isSymbol(value) {
  const type = typeof value;
  return type === 'symbol' ||
    (isObjectLike(value) && Object.prototype.toString.call(value) === symbolTag);
}

function isObject(value) {
  const type = typeof value;
  return value != null && (type === 'object' || type === 'function');
}

function toNumber(value) {
  // T1: already a number
  if (typeof value === 'number') {
    return value;
  }
  // T2: symbol -> NaN
  if (isSymbol(value)) {
    return NAN;
  }
  // T3: object -> valueOf coercion
  if (isObject(value)) {
    const other = (typeof value.valueOf === 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  // T4: non-string -> unary plus (or preserve 0/-0)
  if (typeof value !== 'string') {
    return (value === 0) ? value : (+value);
  }
  // T5: string parsing
  value = value.replace(reTrim, '');
  const isBinary = reIsBinary.test(value);
  if (isBinary || reIsOctal.test(value)) {
    return parseInt(value.slice(2), isBinary ? 2 : 8);
  }
  if (reIsBadHex.test(value)) {
    return NAN;
  }
  return (+value);
}

function gte(value, other) {
  // NODE 1: both primitive strings -> raw lexicographic comparison
  if (typeof value === 'string' && typeof other === 'string') {
    return value >= other;
  }
  // Coercion path
  value = toNumber(value);
  other = toNumber(other);
  // NODE 3: numeric >=
  return value >= other;
}

export default gte;
