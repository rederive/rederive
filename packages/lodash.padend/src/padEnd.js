// @rederive/padEnd — verified-recompose of lodash.padend@4.6.1. quorum 3/3, differential 400/400, round 1. SIR: sir/padEnd.sir
// Clean-room re-emission of lodash.padend@4.6.1 padEnd
// Reconstructed from SIR contract only. Zero dependencies.

const INFINITY = 1 / 0;
const MAX_SAFE_INTEGER = 9007199254740991;
const MAX_INTEGER = 1.7976931348623157e+308;
const NAN = 0 / 0;

const reTrim = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;

// --- unicode regex building blocks (exact from source) ---
const rsAstralRange        = '\ud800-\udfff';
const rsComboMarksRange    = '̀-ͯ︠-︣';
const rsComboSymbolsRange  = '⃐-⃰';
const rsVarRange           = '︎️';
const rsAstral    = '[\ud800-\udfff]';
const rsCombo     = '[' + rsComboMarksRange + rsComboSymbolsRange + ']';
const rsFitz      = '\ud83c[\udffb-\udfff]';
const rsModifier  = '(?:' + rsCombo + '|' + rsFitz + ')';
const rsNonAstral = '[^\ud800-\udfff]';
const rsRegional  = '(?:\ud83c[\udde6-\uddff]){2}';
const rsSurrPair  = '[\ud800-\udbff][\udc00-\udfff]';
const rsZWJ       = '‍';
const reOptMod    = rsModifier + '?';
const rsOptVar    = '[' + rsVarRange + ']?';
const rsOptJoin   = '(?:' + rsZWJ + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsOptVar + reOptMod + ')*';
const rsSeq       = rsOptVar + reOptMod + rsOptJoin;
const rsSymbol    = '(?:' + [rsNonAstral + rsCombo + '?', rsCombo, rsRegional, rsSurrPair, rsAstral].join('|') + ')';

const reUnicode    = RegExp(rsFitz + '(?=' + rsFitz + ')|' + rsSymbol + rsSeq, 'g');
const reHasUnicode = RegExp('[' + rsZWJ + rsAstralRange + rsComboMarksRange + rsComboSymbolsRange + rsVarRange + ']');

const freeParseInt = parseInt;

function hasUnicode(string) {
  return reHasUnicode.test(string);
}

function asciiSize(string) {
  return string.length;
}

function unicodeSize(string) {
  reUnicode.lastIndex = 0;
  let result = 0;
  while (reUnicode.test(string)) result++;
  return result;
}

function unicodeToArray(string) {
  reUnicode.lastIndex = 0;
  return string.match(reUnicode) || [];
}

function stringSize(string) {
  return hasUnicode(string) ? unicodeSize(string) : asciiSize(string);
}

function stringToArray(string) {
  return hasUnicode(string) ? unicodeToArray(string) : string.split('');
}

function baseRepeat(string, n) {
  let result = '';
  if (!string || n < 1 || n > MAX_SAFE_INTEGER) return '';
  // exponentiation-by-squaring
  do {
    if (n % 2) result += string;
    n = Math.floor(n / 2);
    if (n) string += string;
  } while (n);
  return result;
}

function baseSlice(array, start, end) {
  let length = array.length;
  if (start < 0) {
    start = (-start > length) ? 0 : (length + start);
  }
  end = (end > length) ? length : end;
  if (end < 0) end += length;
  length = (start > end) ? 0 : ((end - start) >>> 0);
  start >>>= 0;
  const result = new Array(length);
  for (let index = 0; index < length; index++) {
    result[index] = array[index + start];
  }
  return result;
}

function castSlice(array, start, end) {
  const length = array.length;
  if (end === undefined) end = length;
  return (!start && end >= length) ? array : baseSlice(array, start, end);
}

function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

function isObject(value) {
  return !!value && (typeof value === 'object' || typeof value === 'function');
}

function isSymbol(value) {
  return typeof value === 'symbol' ||
    (isObjectLike(value) && Object.prototype.toString.call(value) === '[object Symbol]');
}

function baseToString(value) {
  if (typeof value === 'string') return value;
  if (isSymbol(value)) {
    return typeof Symbol.prototype.toString === 'function'
      ? Symbol.prototype.toString.call(value)
      : '';
  }
  const result = (value + '');
  return (result === '0' && (1 / value) === -INFINITY) ? '-0' : result;
}

function toString(value) {
  return value == null ? '' : baseToString(value);
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (isSymbol(value)) return NAN;
  if (isObject(value)) {
    const other = (typeof value.valueOf === 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value !== 'string') return value === 0 ? value : +value;
  value = value.replace(reTrim, '');
  const isBinary = reIsBinary.test(value);
  return (isBinary || reIsOctal.test(value))
    ? freeParseInt(value.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex.test(value) ? NAN : +value);
}

function toFinite(value) {
  if (!value) return value === 0 ? value : 0;
  value = toNumber(value);
  if (value === INFINITY || value === -INFINITY) {
    return (value < 0 ? -1 : 1) * MAX_INTEGER;
  }
  return value === value ? value : 0;
}

function toInteger(value) {
  const result = toFinite(value);
  const remainder = result % 1;
  return result === result ? (remainder ? result - remainder : result) : 0;
}

function createPadding(length, chars) {
  chars = (chars === undefined) ? ' ' : baseToString(chars);
  const charsLength = chars.length;
  if (charsLength < 2) {
    return charsLength ? baseRepeat(chars, length) : chars;
  }
  // BRANCH B (charsLength >= 2)
  const result = baseRepeat(chars, Math.ceil(length / stringSize(chars)));
  return hasUnicode(chars)
    ? castSlice(stringToArray(result), 0, length).join('')
    : result.slice(0, length);
}

function padEnd(string, length, chars) {
  string = toString(string);
  length = toInteger(length);
  const strLength = length ? stringSize(string) : 0;
  return (length && strLength < length)
    ? string + createPadding(length - strLength, chars)
    : string;
}

export default padEnd;
