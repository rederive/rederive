// @rederive/trimStart — verified-recompose of lodash.trimstart@4.5.1. quorum 3/3, differential 400/400, round 1. SIR: sir/trimStart.sir
// Clean-room re-emission of lodash trimStart (4.5.1) from SIR contract.
// No external dependencies.

// =====================================================================
// EXACT CONSTANTS (verbatim from SIR)
// =====================================================================

const reTrimStart = /^\s+/;

const rsAstralRange       = '\ud800-\udfff';
const rsComboMarksRange   = '̀-ͯ︠-︣⃐-⃰';
const rsComboSymbolsRange = '⃐-⃿';
const rsVarRange          = '︎️';

const rsAstral    = '[' + rsAstralRange + ']';
const rsCombo     = '[' + rsComboMarksRange + rsComboSymbolsRange + ']';
const rsFitz      = '\ud83c[\udffb-\udfff]';
const rsModifier  = '(?:' + rsCombo + '|' + rsFitz + ')';
const rsNonAstral = '[^' + rsAstralRange + ']';
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

// =====================================================================
// HELPERS
// =====================================================================

function isObjectLike(value) {
  return value != null && typeof value === 'object';
}

function isSymbol(value) {
  return typeof value === 'symbol' ||
    (isObjectLike(value) && Object.prototype.toString.call(value) === '[object Symbol]');
}

function baseToString(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (isSymbol(value)) {
    // Out-of-envelope per SIR; use Symbol.prototype.toString
    return Symbol.prototype.toString ? Symbol.prototype.toString.call(value) : '';
  }
  const result = (value + '');
  // -0 special case
  if (result === '0' && (1 / value) === -Infinity) {
    return '-0';
  }
  return result;
}

function toString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return baseToString(value);
}

function hasUnicode(s) {
  return reHasUnicode.test(s);
}

function asciiToArray(s) {
  return s.split('');
}

function unicodeToArray(s) {
  return s.match(reUnicode) || [];
}

function stringToArray(s) {
  return hasUnicode(s) ? unicodeToArray(s) : asciiToArray(s);
}

function baseIndexOf(array, value, fromIndex) {
  // value is always a string (never NaN), so plain indexOf suffices
  return array.indexOf(value, fromIndex);
}

function baseFindIndex(array, predicate, fromIndex, fromRight) {
  const length = array.length;
  let index = fromIndex + (fromRight ? 1 : -1);
  while (fromRight ? index-- : ++index < length) {
    if (predicate(array[index], index, array)) {
      return index;
    }
  }
  return -1;
}

function charsStartIndex(strSymbols, chrSymbols) {
  let index = -1;
  const length = strSymbols.length;
  while (++index < length && baseIndexOf(chrSymbols, strSymbols[index], 0) > -1) {
    // continue
  }
  return index;
}

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
  end = end === undefined ? length : end;
  if (!start && end >= length) {
    return array;
  }
  return baseSlice(array, start, end);
}

// =====================================================================
// MAIN FUNCTION
// =====================================================================

function trimStart(string, chars, guard) {
  // NODE 1 — coerce string via toString
  string = toString(string);

  // NODE 2 — whitespace branch
  if (string && (guard || chars === undefined)) {
    return string.replace(reTrimStart, '');
  }

  // NODE 3 — early-out when nothing to do
  if (!string || !(chars = baseToString(chars))) {
    return string;
  }

  // NODE 4 — custom-chars branch
  const strSymbols = stringToArray(string);
  const chrSymbols = stringToArray(chars);
  const start = charsStartIndex(strSymbols, chrSymbols);
  return castSlice(strSymbols, start).join('');
}

export default trimStart;
