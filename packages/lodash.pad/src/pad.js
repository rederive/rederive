// @rederive/pad — verified-recompose of lodash.pad@4.5.1. quorum 3/3, differential 400/400, round 1. SIR: sir/pad.sir
// Clean-room re-emission of lodash.pad@4.5.1 behavior.
// Reconstructed purely from the SIR contract and frozen oracle.

const MAX_SAFE_INTEGER = 9007199254740991;

// --- Unicode regex components ---
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
const reOptMod    = rsModifier + '?';
const rsOptVar    = '[' + rsVarRange + ']?';
const rsOptJoin   = '(?:' + rsZWJ + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsOptVar + reOptMod + ')*';
const rsSeq       = rsOptVar + reOptMod + rsOptJoin;
const rsSymbol    = '(?:' + [rsNonAstral + rsCombo + '?', rsCombo, rsRegional, rsSurrPair, rsAstral].join('|') + ')';

const reUnicode = RegExp(rsFitz + '(?=' + rsFitz + ')|' + rsSymbol + rsSeq, 'g');

// reHasUnicode: non-global, stateless check for any unicode-special characters
const reHasUnicode = RegExp('[' + '‍' + rsAstralRange + rsComboMarksRange + rsComboSymbolsRange + rsVarRange + ']');

function hasUnicode(s) {
  return reHasUnicode.test(s);
}

function unicodeSize(s) {
  let result = reUnicode.lastIndex = 0;
  while (reUnicode.test(s)) result++;
  return result;
}

function stringSize(s) {
  return hasUnicode(s) ? unicodeSize(s) : s.length;
}

function stringToArray(s) {
  return hasUnicode(s) ? (s.match(reUnicode) || []) : s.split('');
}

function castSlice(arr, start, end) {
  if (end >= arr.length) return arr;
  return arr.slice(start, end);
}

function baseRepeat(s, n) {
  if (!s || n < 1 || n > MAX_SAFE_INTEGER) return '';
  // exponentiation-by-squaring
  let result = '';
  let str = s;
  while (n > 0) {
    if (n % 2 === 1) result += str;
    n = Math.floor(n / 2);
    if (n > 0) str += str;
  }
  return result;
}

function baseToString(value) {
  if (typeof value === 'string') return value;
  // Symbol path is out-of-envelope; skip isSymbol check
  const result = (value + '');
  return (result === '0' && (1 / value) === -Infinity) ? '-0' : result;
}

function toString(value) {
  return value == null ? '' : baseToString(value);
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  // Symbol -> NaN (out-of-envelope; skipped)
  if (typeof value === 'object' && value !== null) {
    const other = (typeof value.valueOf === 'function') ? value.valueOf() : value;
    value = (typeof other === 'object' && other !== null) ? (other + '') : other;
  }
  if (typeof value !== 'string') {
    return value === 0 ? value : +value;
  }
  value = value.replace(/^\s+|\s+$/g, '');
  const isBinary = /^0b[01]+$/i.test(value);
  return (isBinary || /^0o[0-7]+$/i.test(value))
    ? parseInt(value.slice(2), isBinary ? 2 : 8)
    : (/^[-+]0x[0-9a-f]+$/i.test(value) ? NaN : +value);
}

function toFinite(value) {
  if (!value) return value === 0 ? value : 0;
  value = toNumber(value);
  if (value === Infinity || value === -Infinity) {
    return (value < 0 ? -1 : 1) * 1.7976931348623157e+308;
  }
  return value === value ? value : 0;
}

function toInteger(value) {
  const result = toFinite(value);
  const rem = result % 1;
  return result === result ? (rem ? result - rem : result) : 0;
}

function createPadding(length, chars) {
  if (chars === undefined) {
    chars = ' ';
  } else {
    chars = baseToString(chars);
  }
  const charsLength = chars.length;
  if (charsLength < 2) {
    return charsLength ? baseRepeat(chars, length) : chars;
  }
  // multi code-unit chars
  const charsSize = stringSize(chars);
  const result = baseRepeat(chars, Math.ceil(length / charsSize));
  if (hasUnicode(chars)) {
    return castSlice(stringToArray(result), 0, length).join('');
  } else {
    return result.slice(0, length);
  }
}

function pad(string, length, chars) {
  string = toString(string);
  length = toInteger(length);

  const strLength = length ? stringSize(string) : 0;

  if (!length || strLength >= length) {
    return string;
  }

  const mid = (length - strLength) / 2;
  return createPadding(Math.floor(mid), chars)
    + string
    + createPadding(Math.ceil(mid), chars);
}

export default pad;
