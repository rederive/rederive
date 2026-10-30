// @rederive/isTypedArray — verified-recompose of lodash.istypedarray@4.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/isTypedArray.sir
const typedArrayTags = {
  '[object Float32Array]': true,
  '[object Float64Array]': true,
  '[object Int8Array]': true,
  '[object Int16Array]': true,
  '[object Int32Array]': true,
  '[object Uint8Array]': true,
  '[object Uint8ClampedArray]': true,
  '[object Uint16Array]': true,
  '[object Uint32Array]': true,
  '[object Arguments]': false,
  '[object Array]': false,
  '[object ArrayBuffer]': false,
  '[object Boolean]': false,
  '[object DataView]': false,
  '[object Date]': false,
  '[object Error]': false,
  '[object Function]': false,
  '[object Map]': false,
  '[object Number]': false,
  '[object Object]': false,
  '[object RegExp]': false,
  '[object Set]': false,
  '[object String]': false,
  '[object WeakMap]': false,
};

const MAX_SAFE_INTEGER = 9007199254740991;

const objectToString = Object.prototype.toString;

function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

function isLength(n) {
  return typeof n === 'number' && n > -1 && n % 1 === 0 && n <= MAX_SAFE_INTEGER;
}

function isTypedArray(value) {
  if (!isObjectLike(value)) return false;
  if (!isLength(value.length)) return false;
  return !!typedArrayTags[objectToString.call(value)];
}

export default isTypedArray;
