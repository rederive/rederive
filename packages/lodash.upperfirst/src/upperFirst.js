// @rederive/upperFirst — verified-recompose of lodash.upperfirst@4.3.1. quorum 3/3, differential 400/400, round 1. SIR: sir/upperFirst.sir
// Clean-room re-emission of lodash.upperfirst@4.3.1 upperFirst
// Reconstructed from SIR + frozen oracle only.

// --- hasUnicode / reHasUnicode -----------------------------------------------
// Trigger ranges (from SIR NODE 2):
//   rsZWJ              = '‍'
//   rsAstralRange      = '\ud800-\udfff'
//   rsComboMarksRange  = '̀-ͯ︠-︣'
//   rsComboSymbolsRange= '⃐-⃰'
//   rsVarRange         = '︎️'

const rsZWJ = '‍';
const rsAstralRange = '\ud800-\udfff';
const rsComboMarksRange = '̀-ͯ︠-︣';
const rsComboSymbolsRange = '⃐-⃰';
const rsVarRange = '︎️';

const reHasUnicode = RegExp(
  '[' + rsZWJ + rsAstralRange + rsComboMarksRange + rsComboSymbolsRange + rsVarRange + ']'
);

function hasUnicode(string) {
  return reHasUnicode.test(string);
}

// --- reUnicode (symbol segmentation regex) -----------------------------------
// From SIR NODE 2:
const rsAstral = '[\ud800-\udfff]';
const rsCombo = '[̀-ͯ︠-︣⃐-⃰]';
const rsFitz = '\ud83c[\udffb-\udfff]';
const rsModifier = '(?:' + rsCombo + '|' + rsFitz + ')';
const rsNonAstral = '[^\ud800-\udfff]';
const rsRegional = '(?:\ud83c[\udde6-\uddff]){2}';
const rsSurrPair = '[\ud800-\udbff][\udc00-\udfff]';
const reOptMod = rsModifier + '?';
const rsOptVar = '[︎️]?';
const rsOptJoin =
  '(?:' + rsZWJ +
  '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' +
  rsOptVar + reOptMod + ')*';
const rsSeq = rsOptVar + reOptMod + rsOptJoin;
const rsSymbol =
  '(?:' +
  [rsNonAstral + rsCombo + '?', rsCombo, rsRegional, rsSurrPair, rsAstral].join('|') +
  ')';

const reUnicode = RegExp(rsFitz + '(?=' + rsFitz + ')|' + rsSymbol + rsSeq, 'g');

// --- unicodeToArray ----------------------------------------------------------
function unicodeToArray(string) {
  return string.match(reUnicode) || [];
}

// --- toString coercion (NODE 1) ----------------------------------------------
function isSymbolValue(value) {
  const type = typeof value;
  return type === 'symbol' ||
    (type === 'object' && value !== null &&
      Object.prototype.toString.call(value) === '[object Symbol]');
}

function baseToString(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (isSymbolValue(value)) {
    return Symbol.prototype.toString.call(value);
  }
  const result = String(value);
  // negative-zero fix-up: -0 + '' === '0', but 1/(-0) === -Infinity
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

// --- upperFirst (NODES 2..5) -------------------------------------------------
function upperFirst(value) {
  const string = toString(value);

  if (!string) {
    return string;
  }

  let chr, trailing;

  if (hasUnicode(string)) {
    const strSymbols = unicodeToArray(string);
    chr = strSymbols[0] !== undefined ? strSymbols[0] : '';
    trailing = strSymbols.slice(1).join('');
  } else {
    chr = string.charAt(0);
    trailing = string.slice(1);
  }

  return chr.toUpperCase() + trailing;
}

export default upperFirst;
