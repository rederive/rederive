// @rederive/isNumber — verified-recompose of is-number@7.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/isNumber.sir
export default function isNumber(num) {
  if (typeof num === 'number') {
    return num - num === 0;
  }
  if (typeof num === 'string' && num.trim() !== '') {
    return Number.isFinite(+num);
  }
  return false;
}
