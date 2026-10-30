// @rederive/isArrayLikeObject — verified-recompose of lodash.isarraylikeobject@4.2.0. quorum 3/3, differential 400/400, round 1. SIR: sir/isArrayLikeObject.sir
const MAX_SAFE_INTEGER = 9007199254740991;

function isLength(value) {
  return typeof value === 'number'
    && value > -1
    && value % 1 === 0
    && value <= MAX_SAFE_INTEGER;
}

function isObject(value) {
  return !!value && (typeof value === 'object' || typeof value === 'function');
}

function isFunction(value) {
  const tag = isObject(value) ? Object.prototype.toString.call(value) : '';
  return tag === '[object Function]' || tag === '[object GeneratorFunction]';
}

function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

function isArrayLikeObject(value) {
  return isObjectLike(value) && isArrayLike(value);
}

export default isArrayLikeObject;
