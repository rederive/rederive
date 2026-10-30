// @rederive/isBoolean — verified-recompose of lodash.isboolean@3.0.3. quorum 3/3, differential 400/400, round 1. SIR: sir/isBoolean.sir
const objectToString = Object.prototype.toString;
const boolTag = '[object Boolean]';

function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

export default function isBoolean(value) {
  return value === true
    || value === false
    || (isObjectLike(value) && objectToString.call(value) == boolTag);
}
