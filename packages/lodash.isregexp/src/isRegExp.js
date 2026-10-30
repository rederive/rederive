// @rederive/isRegExp — verified-recompose of lodash.isregexp@4.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/isRegExp.sir
const regexpTag = '[object RegExp]';
const objectToString = Object.prototype.toString;

function isObject(value) {
  const type = typeof value;
  return !!value && (type === 'object' || type === 'function');
}

function baseIsRegExp(value) {
  return isObject(value) && objectToString.call(value) === regexpTag;
}

export default baseIsRegExp;
