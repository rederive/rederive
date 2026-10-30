// @rederive/lte — verified-recompose of lodash.lte@3.9.2. quorum 3/3, differential 400/400, round 1. SIR: sir/lte.sir
function isObjectLike(value) {
  return (!!value) && typeof value === 'object';
}

function isSymbol(value) {
  return typeof value === 'symbol' ||
    (isObjectLike(value) && Object.prototype.toString.call(value) === '[object Symbol]');
}

function isObject(value) {
  return (!!value) && (typeof value === 'object' || typeof value === 'function');
}

function toNumber(value) {
  // (2a) number passthrough
  if (typeof value === 'number') return value;

  // (2b) symbol -> NaN (intercept before unary-plus would throw)
  if (isSymbol(value)) return NaN;

  // (2c) object/function: unwrap via valueOf, then stringify if still object
  if (isObject(value)) {
    var other = (typeof value.valueOf === 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }

  // (2d) non-string primitive (boolean, null, undefined, number from valueOf)
  if (typeof value !== 'string') {
    return value === 0 ? value : +value;
  }

  // (2e) string coercion
  value = value.replace(/^\s+|\s+$/g, '');
  var isBinary = /^0b[01]+$/i.test(value);
  return (isBinary || /^0o[0-7]+$/i.test(value))
    ? parseInt(value.slice(2), isBinary ? 2 : 8)
    : (/^[-+]0x[0-9a-f]+$/i.test(value)
        ? NaN
        : +value);
}

function lte(value, other) {
  // NODE 1 — string-pair guard
  if (!(typeof value === 'string' && typeof other === 'string')) {
    value = toNumber(value);
    other = toNumber(other);
  }
  // NODE 3 — relational compare
  return value <= other;
}

export default lte;
