// @rederive/isLength — verified-recompose of lodash.islength@4.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/isLength.sir
const MAX_SAFE_INTEGER = 9007199254740991;

export default function isLength(value) {
  return typeof value == 'number' &&
    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}
