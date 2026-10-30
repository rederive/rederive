// @rederive/size — verified-recompose of lodash.size@4.2.0. quorum 3/3, differential 400/400, round 1. SIR: sir/size.sir
// Blind clean-room reconstruction of lodash `size` from SIR contract.
// DEFAULT export only — no named exports.

const MAX_SAFE_INTEGER = 9007199254740991;

// reHasUnicode: NON-global — pure membership test, no lastIndex state.
const reHasUnicode = /[‍\ud800-\udfff̀-ͯ︠-︣⃐-⃰︎️]/;

// reUnicode: GLOBAL — authoritative source string reproduced verbatim from SIR.
const reUnicode = RegExp(
  '\ud83c[\udffb-\udfff](?=\ud83c[\udffb-\udfff])|(?:[^\ud800-\udfff][̀-ͯ︠-︣⃐-⃰]?|[̀-ͯ︠-︣⃐-⃰]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff])[︎️]?(?:[̀-ͯ︠-︣⃐-⃰]|\ud83c[\udffb-\udfff])?(?:‍(?:[^\ud800-\udfff]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff])[︎️]?(?:[̀-ͯ︠-︣⃐-⃰]|\ud83c[\udffb-\udfff])?)*',
  'g'
);

function isLength(value) {
  return typeof value === 'number' && value > -1 && value % 1 === 0 && value <= MAX_SAFE_INTEGER;
}

function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

function isObject(value) {
  const type = typeof value;
  return !!value && (type === 'object' || type === 'function');
}

function isFunction(value) {
  const tag = isObject(value) ? Object.prototype.toString.call(value) : '';
  return tag === '[object Function]' || tag === '[object GeneratorFunction]';
}

function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

function isString(value) {
  return typeof value === 'string' ||
    (!Array.isArray(value) && isObjectLike(value) &&
      Object.prototype.toString.call(value) === '[object String]');
}

function asciiSize(s) {
  return s.length;
}

function unicodeSize(s) {
  reUnicode.lastIndex = 0;
  let result = 0;
  while (reUnicode.test(s)) result++;
  return result;
}

function hasUnicode(s) {
  return reHasUnicode.test(s);
}

function stringSize(s) {
  // For boxed String, coerce to primitive for the regex tests.
  const str = String(s);
  return hasUnicode(str) ? unicodeSize(str) : asciiSize(str);
}

function getTag(value) {
  return Object.prototype.toString.call(value);
}

function baseKeys(object) {
  return Object.keys(Object(object));
}

function size(collection) {
  // NODE 1: nullish guard
  if (collection == null) return 0;

  // NODE 2: array-like branch
  if (isArrayLike(collection)) {
    return isString(collection) ? stringSize(collection) : collection.length;
  }

  // NODE 3: Map / Set branch
  const tag = getTag(collection);
  if (tag === '[object Map]' || tag === '[object Set]') {
    return collection.size;
  }

  // NODE 4: object key-count fallback
  return baseKeys(collection).length;
}

export default size;
