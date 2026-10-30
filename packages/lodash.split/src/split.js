// @rederive/split — verified-recompose of lodash.split@4.4.2. quorum 3/3, differential 400/400, round 1. SIR: sir/split.sir
// Clean-room re-emission of lodash.split@4.4.2
// Reconstructed from SIR contract and frozen oracle only.

// ============================================================================
// CONSTANTS
// ============================================================================
const MAX_ARRAY_LENGTH = 4294967295;   // 2^32 - 1
const MAX_SAFE_INTEGER = 9007199254740991; // 2^53 - 1
const INFINITY = 1 / 0;

// Unicode regex pieces (reproduced verbatim from SIR CONSTANTS)
const rsAstralRange       = '\ud800-\udfff';
const rsComboMarksRange   = '̀-ͯ︠-︣';
const rsComboSymbolsRange = '⃐-⃰';
const rsVarRange          = '︎️';

const rsAstral    = '[' + rsAstralRange + ']';
const rsCombo     = '[' + rsComboMarksRange + rsComboSymbolsRange + ']';
const rsFitz      = '\ud83c[\udffb-\udfff]';
const rsModifier  = '(?:' + rsCombo + '|' + rsFitz + ')';
const rsNonAstral = '[^' + rsAstralRange + ']';
const rsRegional  = '(?:\ud83c[\udde6-\uddff]){2}';
const rsSurrPair  = '[\ud800-\udbff][\udc00-\udfff]';
const rsZWJ       = '‍';

const reOptMod  = rsModifier + '?';
const rsOptVar  = '[' + rsVarRange + ']?';
const rsOptJoin = '(?:' + rsZWJ + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsOptVar + reOptMod + ')*';
const rsSeq     = rsOptVar + reOptMod + rsOptJoin;
const rsSymbol  = '(?:' + [rsNonAstral + rsCombo + '?', rsCombo, rsRegional, rsSurrPair, rsAstral].join('|') + ')';

// reUnicode: matches one "user-perceived character" (grapheme-ish), GLOBAL
const reUnicode = RegExp(rsFitz + '(?=' + rsFitz + ')|' + rsSymbol + rsSeq, 'g');

// reHasUnicode: single-char presence test (not global)
const reHasUnicode = RegExp('[' + rsZWJ + rsAstralRange + rsComboMarksRange + rsComboSymbolsRange + rsVarRange + ']');

// reIsUint: used by isIndex
const reIsUint = /^(?:0|[1-9]\d*)$/;

// ============================================================================
// HELPERS
// ============================================================================

function isObject(v) {
  return !!v && (typeof v === 'object' || typeof v === 'function');
}

function isObjectLike(v) {
  return !!v && typeof v === 'object';
}

function eq(a, b) {
  return a === b || (a !== a && b !== b);
}

function isLength(v) {
  return typeof v === 'number' && v > -1 && v % 1 === 0 && v <= MAX_SAFE_INTEGER;
}

function isFunction(v) {
  const tag = isObject(v) ? Object.prototype.toString.call(v) : '';
  return tag === '[object Function]' || tag === '[object GeneratorFunction]';
}

function isArrayLike(v) {
  return v != null && isLength(v.length) && !isFunction(v);
}

function isSymbol(v) {
  return typeof v === 'symbol' ||
    (isObjectLike(v) && Object.prototype.toString.call(v) === '[object Symbol]');
}

function isRegExp(v) {
  return isObject(v) && Object.prototype.toString.call(v) === '[object RegExp]';
}

function isIndex(value, length) {
  length = (length == null) ? MAX_SAFE_INTEGER : length;
  return !!length &&
    (typeof value === 'number' || reIsUint.test(value)) &&
    (value > -1 && value % 1 === 0 && value < length);
}

function isIterateeCall(value, index, object) {
  if (!isObject(object)) return false;
  const type = typeof index;
  if (type === 'number'
    ? (isArrayLike(object) && isIndex(index, object.length))
    : (type === 'string' && index in object)) {
    return eq(object[index], value);
  }
  return false;
}

function baseToString(value) {
  if (typeof value === 'string') return value;
  if (isSymbol(value)) return String(value);
  const result = (value + '');
  return (result === '0' && (1 / value) === -INFINITY) ? '-0' : result;
}

function toString(value) {
  return value == null ? '' : baseToString(value);
}

// Array slicing helpers
function baseSlice(array, start, end) {
  let index = -1;
  let length = array.length;
  if (start < 0) {
    start = -start > length ? 0 : (length + start);
  }
  end = end > length ? length : end;
  if (end < 0) {
    end += length;
  }
  length = start > end ? 0 : ((end - start) >>> 0);
  start >>>= 0;
  const result = Array(length);
  while (++index < length) {
    result[index] = array[index + start];
  }
  return result;
}

function castSlice(array, start, end) {
  const length = array.length;
  end = (end === undefined) ? length : end;
  return (!start && end >= length) ? array : baseSlice(array, start, end);
}

// Unicode-aware array conversion
function hasUnicode(string) {
  return reHasUnicode.test(string);
}

function asciiToArray(string) {
  return string.split('');
}

function unicodeToArray(string) {
  // Reset lastIndex since reUnicode is global
  reUnicode.lastIndex = 0;
  return string.match(reUnicode) || [];
}

function stringToArray(string) {
  return hasUnicode(string) ? unicodeToArray(string) : asciiToArray(string);
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

function split(string, separator, limit) {
  // NODE 1 — isIterateeCall guard
  if (limit && typeof limit !== 'number' && isIterateeCall(string, separator, limit)) {
    separator = undefined;
    limit = undefined;
  }

  // NODE 2 — limit coercion (ToUint32)
  limit = (limit === undefined) ? MAX_ARRAY_LENGTH : (limit >>> 0);

  // NODE 3 — empty-result short-circuit
  if (!limit) return [];

  // NODE 4 — string coercion
  string = toString(string);

  // NODE 5 — empty-separator Unicode branch
  if (
    string &&
    (typeof separator === 'string' ||
      (separator != null && !isRegExp(separator)))
  ) {
    separator = baseToString(separator);
    if (!separator && hasUnicode(string)) {
      return castSlice(stringToArray(string), 0, limit);
    }
  }

  // NODE 6 — native split (terminal)
  return string.split(separator, limit);
}

export default split;
