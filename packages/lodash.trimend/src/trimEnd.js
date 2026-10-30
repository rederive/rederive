// @rederive/trimEnd — verified-recompose of lodash.trimend@4.18.0. quorum 3/3, differential 400/400, round 1. SIR: sir/trimEnd.sir
// Clean-room re-emission of lodash trimEnd from SIR contract.
// Zero dependencies. Pure ESM.

// ---- Unicode regex construction (byte-exact per SIR) --------------------------------
const rsAstralRange        = '\ud800-\udfff';
const rsComboMarksRange    = '̀-ͯ';
const reComboHalfMarksRange = '︠-︯';
const rsComboSymbolsRange  = '⃐-⃿';
const rsComboRange         = rsComboMarksRange + reComboHalfMarksRange + rsComboSymbolsRange;
const rsVarRange           = '︎️';

const rsAstral   = '[' + rsAstralRange + ']';
const rsCombo    = '[' + rsComboRange + ']';
const rsFitz     = '\ud83c[\udffb-\udfff]';
const rsModifier = '(?:' + rsCombo + '|' + rsFitz + ')';
const rsNonAstral = '[^' + rsAstralRange + ']';
const rsRegional = '(?:\ud83c[\udde6-\uddff]){2}';
const rsSurrPair = '[\ud800-\udbff][\udc00-\udfff]';
const rsZWJ      = '‍';

const reOptMod  = rsModifier + '?';
const rsOptVar  = '[' + rsVarRange + ']?';
const rsOptJoin = '(?:' + rsZWJ + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')'
                        + rsOptVar + reOptMod + ')*';
const rsSeq     = rsOptVar + reOptMod + rsOptJoin;
const rsSymbol  = '(?:' + [
  rsNonAstral + rsCombo + '?',
  rsCombo,
  rsRegional,
  rsSurrPair,
  rsAstral
].join('|') + ')';

const reUnicode = RegExp(
  rsFitz + '(?=' + rsFitz + ')|' + rsSymbol + rsSeq,
  'g'
);

const reHasUnicode = RegExp(
  '[' + rsZWJ + rsAstralRange + rsComboRange + rsVarRange + ']'
);

// ---- Coercion helpers ---------------------------------------------------------------

function isObjectLike(value) {
  return value != null && typeof value === 'object';
}

function isSymbol(value) {
  return typeof value === 'symbol' ||
    (isObjectLike(value) && Object.prototype.toString.call(value) === '[object Symbol]');
}

function baseToString(value) {
  // 1. string identity
  if (typeof value === 'string') {
    return value;
  }
  // 2. array: element-wise recursive baseToString, joined with ','
  if (Array.isArray(value)) {
    return value.map(baseToString) + '';
  }
  // 3. symbol
  if (isSymbol(value)) {
    return Symbol.prototype.toString.call(value);
  }
  // 4. default coercion with negative-zero preservation
  const result = (value + '');
  if (result === '0' && (1 / value) === -Infinity) {
    return '-0';
  }
  return result;
}

function toString(value) {
  if (value == null) {
    return '';
  }
  return baseToString(value);
}

// ---- Whitespace branch helper -------------------------------------------------------

function trimmedEndIndex(string) {
  let index = string.length;
  while (index-- && /\s/.test(string.charAt(index))) {}
  return index;
}

// ---- Symbol splitting helpers -------------------------------------------------------

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

// ---- charsEndIndex ------------------------------------------------------------------

function baseIndexOf(array, value, fromIndex) {
  let index = fromIndex - 1;
  const length = array.length;
  while (++index < length) {
    if (array[index] === value) {
      return index;
    }
  }
  return -1;
}

function charsEndIndex(strSymbols, chrSymbols) {
  let index = strSymbols.length;
  while (index-- && baseIndexOf(chrSymbols, strSymbols[index], 0) > -1) {}
  return index;
}

// ---- castSlice ----------------------------------------------------------------------

function baseSlice(array, start, end) {
  let index = -1;
  const length = array.length;
  // clamp end
  if (end > length) {
    end = length;
  }
  const result = new Array(end - start);
  while (++index < end - start) {
    result[index] = array[start + index];
  }
  return result;
}

function castSlice(array, start, end) {
  const length = array.length;
  end = end === undefined ? length : end;
  return (!start && end >= length) ? array : baseSlice(array, start, end);
}

// ---- Main function ------------------------------------------------------------------

function trimEnd(string, chars, guard) {
  // NODE 1: coerce string
  string = toString(string);

  // NODE 2: whitespace branch
  if (string && (guard || chars === undefined)) {
    return string.slice(0, trimmedEndIndex(string) + 1);
  }

  // NODE 3: chars coercion + empty guard
  if (!string || !(chars = baseToString(chars))) {
    return string;
  }

  // NODE 4: custom-chars symbol trim
  const strSymbols = stringToArray(string);
  const end = charsEndIndex(strSymbols, stringToArray(chars)) + 1;
  return castSlice(strSymbols, 0, end).join('');
}

export default trimEnd;
