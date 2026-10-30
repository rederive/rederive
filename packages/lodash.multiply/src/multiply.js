// @rederive/multiply — verified-recompose of lodash.multiply@4.9.0. quorum 3/3, differential 400/400, round 1. SIR: sir/multiply.sir
// Clean-room re-emission of lodash.multiply@4.9.0
// Reconstructed from SIR + frozen oracle — no original source consulted.

function isSymbol(value) {
  const type = typeof value;
  return type === 'symbol' ||
    (value !== null && type === 'object' &&
      Object.prototype.toString.call(value) === '[object Symbol]');
}

function baseToNumber(value) {
  if (typeof value === 'number') return value;
  if (isSymbol(value)) return NaN;
  return +value;
}

function baseToString(value) {
  if (typeof value === 'string') return value;
  if (isSymbol(value)) {
    return (typeof Symbol !== 'undefined' && Symbol.prototype)
      ? value.toString()
      : '';
  }
  const result = (value + '');
  if (result === '0' && (1 / value) === -Infinity) return '-0';
  return result;
}

function multiply(value, other) {
  // BRANCH D0: both undefined -> return defaultValue (1)
  if (value === undefined && other === undefined) {
    return 1;
  }

  // result starts as value (or remains undefined if value===undefined)
  let result = (value !== undefined) ? value : undefined;

  if (other !== undefined) {
    // Both value and other are defined (D0 already excluded both-undefined)
    // BRANCH P2: value was undefined but other is defined
    if (result === undefined) {
      return other;
    }

    // BRANCH S: either is a string -> string path
    if (typeof value === 'string' || typeof other === 'string') {
      const a = baseToString(value);
      const b = baseToString(other);
      return a * b;
    }

    // BRANCH N: number path
    const a = baseToNumber(value);
    const b = baseToNumber(other);
    return a * b;
  }

  // BRANCH P1: other === undefined (and value !== undefined, since D0 excluded)
  return result;
}

export default multiply;
