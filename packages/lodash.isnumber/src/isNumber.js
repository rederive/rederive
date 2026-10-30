// @rederive/isNumber — verified-recompose of lodash.isnumber@3.0.3. quorum 3/3, differential 400/400, round 1. SIR: sir/isNumber.sir
const numberTag = '[object Number]';
const objectToString = Object.prototype.toString;

function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

function isNumber(value) {
  if (typeof value === 'number') return true;
  if (isObjectLike(value) && objectToString.call(value) === numberTag) return true;
  return false;
}

export default isNumber;
