// @rederive/trim — verified-recompose of lodash.trim@4.5.1. quorum 3/3, differential 400/400, round 2. SIR: sir/trim.sir
// Clean-room re-emission of lodash.trim@4.5.1
// Reconstructed purely from SIR contract + frozen oracle.

// ---- Constants ----

// reTrim: standard ECMAScript \s at both ends
const reTrim = /^\s+|\s+$/g;

// reHasUnicode: NO `g` flag — stateless .test()
// Matches ZWJ (‍), any surrogate (\uD800-\uDFFF), combining marks
// (̀-ͯ, ︠-︣), combining symbols (⃐-⃰),
// variation selectors (︎-️).
const reHasUnicode = RegExp(
  '[‍\uD800-\uDFFF̀-ͯ︠-︣⃐-⃰︎️]'
);

// reUnicode: composed from named fragments, `g` flag
// Fragment names (from SIR):
const rsAstralRange       = '\uD800-\uDFFF';
const rsComboMarksRange   = '̀-ͯ︠-︣';
const rsComboSymbolsRange = '⃐-⃰';
const rsVarRange          = '︎️';

const rsCombo    = '[' + rsComboMarksRange + rsComboSymbolsRange + ']';
const rsFitz     = '\uD83C[\uDFFB-\uDFFF]';
const rsModifier = '(?:' + rsCombo + '|' + rsFitz + ')';
const rsNonAstral= '[^\uD800-\uDFFF]';
const rsRegional = '(?:\uD83C[\uDDE6-\uDDFF]){2}';
const rsSurrPair = '[\uD800-\uDBFF][\uDC00-\uDFFF]';
const rsAstral   = '[\uD800-\uDFFF]';
const rsZWJ      = '‍';

const rsOptVar   = '[' + rsVarRange + ']?';
const reOptMod   = rsModifier + '?';
const rsOptJoin  = '(?:' + rsZWJ + '(?:' + rsNonAstral + '|' + rsRegional + '|' + rsSurrPair + ')' + rsOptVar + reOptMod + ')*';
const rsSeq      = rsOptVar + reOptMod + rsOptJoin;
const rsSymbol   = '(?:' + rsNonAstral + rsCombo + '?|' + rsCombo + '|' + rsRegional + '|' + rsSurrPair + '|' + rsAstral + ')';

const reUnicode = RegExp(
  rsFitz + '(?=' + rsFitz + ')|' + rsSymbol + rsSeq,
  'g'
);

// ---- Helper: symbol/Symbol detection ----
// We check for Symbol in the runtime environment
const symbolTag = '[object Symbol]';
const objectToString = Object.prototype.toString;

function isSymbol(value) {
  const type = typeof value;
  return type === 'symbol' || (type === 'object' && value !== null && objectToString.call(value) === symbolTag);
}

// symbolToString: safely call Symbol.prototype.toString
const symbolProto = typeof Symbol !== 'undefined' ? Symbol.prototype : null;
const symbolToString = symbolProto ? symbolProto.toString : null;

// ---- baseToString ----
// Coerces a value to string (no null->'' shortcut; null -> 'null').
function baseToString(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (isSymbol(value)) {
    return symbolToString ? symbolToString.call(value) : '';
  }
  const result = value + '';
  // Special-case -0: (value + '') is '0' but 1/value is -Infinity
  if (result === '0' && (1 / value) === -Infinity) {
    return '-0';
  }
  return result;
}

// ---- toString (the string-arg coercion, with null/undefined -> '') ----
function toString(value) {
  if (value == null) {
    return '';
  }
  return baseToString(value);
}

// ---- stringToArray helpers ----

function asciiToArray(s) {
  return s.split('');
}

function unicodeToArray(s) {
  // reUnicode has 'g' flag; String#match with g returns fresh Array of all matches, ignores lastIndex
  return s.match(reUnicode) || [];
}

function hasUnicode(s) {
  return reHasUnicode.test(s);
}

function stringToArray(s) {
  return hasUnicode(s) ? unicodeToArray(s) : asciiToArray(s);
}

// ---- baseIndexOf: strict === scan ----
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

// ---- charsStartIndex ----
function charsStartIndex(strSymbols, chrSymbols) {
  let index = -1;
  const length = strSymbols.length;
  while (++index < length && baseIndexOf(chrSymbols, strSymbols[index], 0) > -1) {
    // continue
  }
  return index;
}

// ---- charsEndIndex ----
function charsEndIndex(strSymbols, chrSymbols) {
  let index = strSymbols.length;
  while (index-- && baseIndexOf(chrSymbols, strSymbols[index], 0) > -1) {
    // continue
  }
  return index;
}

// ---- baseSlice ----
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

// ---- castSlice ----
function castSlice(array, start, end) {
  const length = array.length;
  end = (end === undefined) ? length : end;
  if (!start && end >= length) {
    return array;
  }
  return baseSlice(array, start, end);
}

// ---- The main trim function ----

function trim(string, chars, guard) {
  // STEP 1: coerce string
  string = toString(string);

  // STEP 2: WHITESPACE mode
  // if (string && (guard || chars === undefined))
  if (string && (guard || chars === undefined)) {
    return string.replace(reTrim, '');
  }

  // STEP 3: early return when no usable chars
  // if (!string || !(chars = baseToString(chars)))
  if (!string || !(chars = baseToString(chars))) {
    return string;
  }

  // STEP 4: CUSTOM-CHARS mode (unicode-symbol-aware)
  const strSymbols = stringToArray(string);
  const chrSymbols = stringToArray(chars);
  const start = charsStartIndex(strSymbols, chrSymbols);
  const end = charsEndIndex(strSymbols, chrSymbols) + 1;
  return castSlice(strSymbols, start, end).join('');
}

export default trim;
