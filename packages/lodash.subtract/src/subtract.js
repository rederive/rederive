// @rederive/subtract — verified-recompose of lodash.subtract@4.2.0. quorum 3/3, differential 400/400, round 2. SIR: sir/subtract.sir
// Blind clean-room re-emission of lodash.subtract@4.2.0
// Reconstructed from SIR + frozen oracle. No original source consulted.

function isSymbol(value) {
  const type = typeof value;
  return type === 'symbol' ||
    (type === 'object' && value !== null &&
      Object.prototype.toString.call(value) === '[object Symbol]');
}

function baseToNumber(value) {
  if (typeof value === 'number') return value;
  if (isSymbol(value)) return NaN;
  return +value;
}

function baseToString(value) {
  if (typeof value === 'string') return value;
  if (isSymbol(value)) return Symbol.prototype.toString.call(value);
  // Use (value + '') — ToPrimitive hint="default" (valueOf-first), NOT String(value)
  const result = (value + '');
  return (result === '0' && (1 / value) === -Infinity) ? '-0' : result;
}

function subtract(value, other) {
  var result;

  // NODE A — both undefined: return defaultValue (0)
  if (value === undefined && other === undefined) return 0;

  // NODE B — seed result from value if present
  if (value !== undefined) result = value;

  // NODE C — combine with other if present
  if (other !== undefined) {
    // NODE C1 — only other present (value was undefined): return raw other
    if (result === undefined) return other;

    // NODE C2 — both present: select branch by string-ness of RAW operands
    if (typeof value === 'string' || typeof other === 'string') {
      // STRING BRANCH: coerce both via baseToString
      value = baseToString(value);
      other = baseToString(other);
    } else {
      // NUMBER BRANCH: coerce both via baseToNumber
      value = baseToNumber(value);
      other = baseToNumber(other);
    }

    // NODE D — apply operator
    result = value - other;
  }

  return result;
}

export default subtract;
