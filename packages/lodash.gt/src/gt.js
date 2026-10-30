// @rederive/gt — verified-recompose of lodash.gt@3.9.2. quorum 3/3, differential 400/400, round 1. SIR: sir/gt.sir
// Clean-room reconstruction of lodash.gt — emitter #1
// Implements the NODE 1 / NODE 2 / toNumber pipeline from the SIR verbatim.

const NAN = 0 / 0;
const symbolTag = '[object Symbol]';

const reTrim     = /^\s+|\s+$/g;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal  = /^0o[0-7]+$/i;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;

function isSymbol(value) {
  if (typeof value === 'symbol') return true;
  if (value != null && typeof value === 'object') {
    return Object.prototype.toString.call(value) === symbolTag;
  }
  return false;
}

function isObject(value) {
  // truthy AND typeof in {'object','function'}
  const type = typeof value;
  return !!value && (type === 'object' || type === 'function');
}

function toNumber(value) {
  // T1: number pass-through
  if (typeof value === 'number') {
    return value;
  }
  // T2: symbol -> NaN
  if (isSymbol(value)) {
    return NAN;
  }
  // T3: object unwrap via valueOf
  if (isObject(value)) {
    const other = (typeof value.valueOf === 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  // T4: non-string after T3
  if (typeof value !== 'string') {
    return (value === 0) ? value : (+value);
  }
  // T5: string — trim, then parse binary/octal/bad-hex/everything-else
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

function gt(value, other) {
  // NODE 1: string-pair guard
  if (typeof value === 'string' && typeof other === 'string') {
    // both strings -> raw lexicographic comparison, no coercion
    return value > other;
  }
  // else-branch: coerce both via toNumber
  value = toNumber(value);
  other = toNumber(other);
  // NODE 2: baseGt
  return value > other;
}

export default gt;
