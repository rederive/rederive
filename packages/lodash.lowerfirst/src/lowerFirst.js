// @rederive/lowerFirst — verified-recompose of lodash.lowerfirst@4.3.1. quorum 3/3, differential 400/400, round 1. SIR: sir/lowerFirst.sir
// Clean-room re-emission of lodash lowerFirst (lodash.lowerfirst@4.3.1)
// Reconstructed from SIR + frozen oracle. Zero deps, pure ESM.

// ---- Regex constants (EXACT from SIR) ----

// hasUnicode: NON-GLOBAL — no lastIndex carry-over, stateless across calls
const rsZWJ               = '‍';
const rsAstralRange       = '\ud800-\udfff';
const rsComboMarksRange   = '̀-ͯ︠-︣';
const rsComboSymbolsRange = '⃐-⃰';
const rsVarRange          = '︎️';

const reHasUnicode = RegExp(
  '[' + rsZWJ + rsAstralRange + rsComboMarksRange + rsComboSymbolsRange + rsVarRange + ']'
);

// unicodeToArray: GLOBAL — consumed via String.prototype.match (resets lastIndex each call)
const rsAstral    = '[\ud800-\udfff]';
const rsCombo     = '[̀-ͯ︠-︣⃐-⃰]';
const rsFitz      = '\ud83c[\udffb-\udfff]';
const rsModifier  = '(?:' + rsCombo + '|' + rsFitz + ')';
const rsNonAstral = '[^\ud800-\udfff]';
const rsRegional  = '(?:\ud83c[\udde6-\uddff]){2}';
const rsSurrPair  = '[\ud800-\udbff][\udc00-\udfff]';
const reOptMod    = rsModifier + '?';
const rsOptVar    = '[' + rsVarRange + ']?';
const rsOptJoin   = '(?:' + rsZWJ + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsOptVar + reOptMod + ')*';
const rsSeq       = rsOptVar + reOptMod + rsOptJoin;
const rsSymbol    = '(?:' + [rsNonAstral + rsCombo + '?', rsCombo, rsRegional, rsSurrPair, rsAstral].join('|') + ')';

const reUnicode = RegExp(rsFitz + '(?=' + rsFitz + ')|' + rsSymbol + rsSeq, 'g');

// ---- lodash toString coercion ----

function isSymbol(value) {
  const type = typeof value;
  return type === 'symbol' ||
    (type === 'object' && value !== null &&
      Object.prototype.toString.call(value) === '[object Symbol]');
}

function baseToString(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (isSymbol(value)) {
    return Symbol.prototype.toString.call(value);
  }
  const result = (value + '');
  // Special-case negative zero
  if (result === '0' && (1 / value) === -Infinity) {
    return '-0';
  }
  return result;
}

function toString(value) {
  // Loose == null catches both null and undefined
  if (value == null) {
    return '';
  }
  return baseToString(value);
}

// ---- hasUnicode ----

function hasUnicode(str) {
  return reHasUnicode.test(str);
}

// ---- unicodeToArray (stringToArray for unicode path) ----

function unicodeToArray(str) {
  return str.match(reUnicode) || [];
}

// ---- lowerFirst ----

function lowerFirst(value) {
  const S = toString(value);

  if (S === '') {
    return '';
  }

  if (!hasUnicode(S)) {
    // ASCII path
    const chr      = S.charAt(0);
    const trailing = S.slice(1);
    return chr.toLowerCase() + trailing;
  } else {
    // Unicode path
    const strSymbols = unicodeToArray(S);
    const chr        = strSymbols[0];
    const trailing   = strSymbols.slice(1).join('');
    return chr.toLowerCase() + trailing;
  }
}

export default lowerFirst;
