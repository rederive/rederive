// @rederive/toArray — verified-recompose of lodash.toarray@4.4.0. quorum 3/3, differential 400/400, round 1. SIR: sir/toArray.sir
// Clean-room re-emission of lodash.toarray@4.4.0
// Reconstructed from SIR contract + frozen oracle only.

const MAX_SAFE_INTEGER = 9007199254740991;

// Unicode regex fragments (exact from SIR)
const rsAstralRange       = '\\ud800-\\udfff';
const rsComboMarksRange   = '\\u0300-\\u036f\\ufe20-\\ufe23';
const rsComboSymbolsRange = '\\u20d0-\\u20f0';
const rsVarRange          = '\\ufe0e\\ufe0f';

const rsAstral    = '[' + rsAstralRange + ']';
const rsCombo     = '[' + rsComboMarksRange + rsComboSymbolsRange + ']';
const rsFitz      = '\\ud83c[\\udffb-\\udfff]';
const rsModifier  = '(?:' + rsCombo + '|' + rsFitz + ')';
const rsNonAstral = '[^' + rsAstralRange + ']';
const rsRegional  = '(?:\\ud83c[\\udde6-\\uddff]){2}';
const rsSurrPair  = '[\\ud800-\\udbff][\\udc00-\\udfff]';
const rsZWJ       = '\\u200d';

const reOptMod  = rsModifier + '?';
const rsOptVar  = '[' + rsVarRange + ']?';
const rsOptJoin = '(?:' + rsZWJ + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsOptVar + reOptMod + ')*';
const rsSeq     = rsOptVar + reOptMod + rsOptJoin;
const rsSymbol  = '(?:' + [rsNonAstral + rsCombo + '?', rsCombo, rsRegional, rsSurrPair, rsAstral].join('|') + ')';

const reUnicode = RegExp(rsFitz + '(?=' + rsFitz + ')|' + rsSymbol + rsSeq, 'g');

// hasUnicode detection regex
const reHasUnicode = RegExp(
  '[' + '\\u200d' + rsAstralRange + rsComboMarksRange + rsComboSymbolsRange + rsVarRange + ']'
);

function hasUnicode(string) {
  return reHasUnicode.test(string);
}

function asciiToArray(string) {
  return string.split('');
}

function unicodeToArray(string) {
  return string.match(reUnicode) || [];
}

function stringToArray(string) {
  return hasUnicode(string) ? unicodeToArray(string) : asciiToArray(string);
}

function isLength(value) {
  return typeof value === 'number'
    && value > -1
    && value % 1 === 0
    && value <= MAX_SAFE_INTEGER;
}

function isFunction(value) {
  const tag = Object.prototype.toString.call(value);
  return tag === '[object Function]' || tag === '[object GeneratorFunction]';
}

function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

function isString(value) {
  if (typeof value === 'string') return true;
  if (Array.isArray(value)) return false;
  if (value === null || typeof value !== 'object') return false;
  return Object.prototype.toString.call(value) === '[object String]';
}

function copyArray(source) {
  const length = source.length;
  const array = Array(length);
  for (let index = 0; index < length; index++) {
    array[index] = source[index];
  }
  return array;
}

function mapToArray(map) {
  const result = Array(map.size);
  let index = -1;
  map.forEach((value, key) => {
    result[++index] = [key, value];
  });
  return result;
}

function setToArray(set) {
  const result = Array(set.size);
  let index = -1;
  set.forEach(value => {
    result[++index] = value;
  });
  return result;
}

function baseKeys(object) {
  return Object.keys(Object(object));
}

function baseValues(object, keys) {
  return keys.map(key => object[key]);
}

function values(object) {
  if (!object) return [];
  const keys = baseKeys(object);
  return baseValues(object, keys);
}

function iteratorToArray(iterator) {
  const result = [];
  let data;
  while (!(data = iterator.next()).done) {
    result.push(data.value);
  }
  return result;
}

function getTag(value) {
  return Object.prototype.toString.call(value);
}

function toArray(value) {
  // NODE 1 — FALSY GUARD
  if (!value) return [];

  // NODE 2 — ARRAY-LIKE BRANCH
  if (isArrayLike(value)) {
    return isString(value) ? stringToArray(value) : copyArray(value);
  }

  // NODE 3 — ITERATOR-SYMBOL BRANCH
  if (typeof Symbol !== 'undefined' && Symbol.iterator && value[Symbol.iterator]) {
    return iteratorToArray(value[Symbol.iterator]());
  }

  // NODE 4 — GETTAG DISPATCH
  const tag = getTag(value);
  if (tag === '[object Map]') return mapToArray(value);
  if (tag === '[object Set]') return setToArray(value);
  return values(value);
}

export default toArray;
