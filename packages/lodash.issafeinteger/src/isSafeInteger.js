// @rederive/isSafeInteger — verified-recompose of lodash.issafeinteger@4.0.4. quorum 3/3, differential 400/400, round 1. SIR: sir/isSafeInteger.sir
const MAX_SAFE_INTEGER = 9007199254740991; // 2^53 - 1

export default function isSafeInteger(value) {
  // NODE-1: type guard — only primitive numbers proceed
  if (typeof value !== 'number') {
    return false;
  }

  // NODE-2: integer check — finite and fraction-free
  // value == Math.trunc(value) handles NaN (NaN != 0) and ±Infinity (Inf != large finite)
  if (value !== Math.trunc(value)) {
    return false;
  }

  // NODE-3: range check — inclusive bounds ±MAX_SAFE_INTEGER
  return value >= -MAX_SAFE_INTEGER && value <= MAX_SAFE_INTEGER;
}
