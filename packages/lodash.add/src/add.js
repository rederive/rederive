// @rederive/add — verified-recompose of lodash.add@3.7.0. quorum 3/3, differential 400/400, round 1. SIR: sir/add.sir
function isSymbol(v) {
  if (typeof v === 'symbol') return true;
  if (v !== null && typeof v === 'object') {
    return Object.prototype.toString.call(v) === '[object Symbol]';
  }
  return false;
}

function baseToNumber(v) {
  if (typeof v === 'number') return v;
  if (isSymbol(v)) return NaN;
  return +v;
}

function baseToString(v) {
  if (typeof v === 'string') return v;
  if (isSymbol(v)) return String(v);
  const result = v + '';
  if (result === '0' && (1 / v) === -Infinity) return '-0';
  return result;
}

function add(value, other) {
  // BRANCH-0: both undefined -> defaultValue 0
  if (value === undefined && other === undefined) {
    return 0;
  }

  // Initialize result
  let result = undefined;

  // BRANCH-1: seed result from value
  if (value !== undefined) {
    result = value;
  }

  // BRANCH-2: fold in other
  if (other !== undefined) {
    // BRANCH-2a: value was undefined -> return other RAW
    if (result === undefined) {
      return other;
    }

    // BRANCH-2b: both present -> choose string vs numeric mode
    if (typeof value === 'string' || typeof other === 'string') {
      value = baseToString(value);
      other = baseToString(other);
      result = value + other;
    } else {
      value = baseToNumber(value);
      other = baseToNumber(other);
      result = value + other;
    }
  }

  return result;
}

export default add;
