// @rederive/capitalize — verified-recompose of lodash.capitalize@4.2.1. quorum 3/3, differential 400/400, round 1. SIR: sir/capitalize.sir
// Clean-room re-emission of lodash.capitalize@4.2.1
// Reconstructed from SIR contract + frozen oracle. No original source consulted.

// ---- Unicode regex building blocks (exact composition from SIR) ----
const rsAstralRange   = '\ud800-\udfff';
const rsComboMarksRange = '̀-ͯ︠-︣';
const rsComboSymbolsRange = '⃐-⃰';
const rsVarRange      = '︎️';

const rsZWJ           = '‍';
const rsFitz          = '\ud83c[\udffb-\udfff]';
const rsCombo         = '[' + rsComboMarksRange + rsComboSymbolsRange + ']';
const rsModifier      = '(?:' + rsCombo + '|' + rsFitz + ')';
const rsNonAstral     = '[^' + rsAstralRange + ']';
const rsRegional      = '(?:\ud83c[\udde6-\uddff]){2}';
const rsSurrPair      = '[\ud800-\udbff][\udc00-\udfff]';
const rsAstral        = '[' + rsAstralRange + ']';

const reOptMod        = rsModifier + '?';
const rsOptVar        = '[' + rsVarRange + ']?';
const rsOptJoin       = '(?:' + rsZWJ + '(?:' + rsNonAstral + '|' + rsRegional + '|' + rsSurrPair + ')' + rsOptVar + reOptMod + ')*';
const rsSeq           = rsOptVar + reOptMod + rsOptJoin;
const rsSymbol        = '(?:' + rsNonAstral + rsCombo + '?|' + rsCombo + '|' + rsRegional + '|' + rsSurrPair + '|' + rsAstral + ')';

// reUnicode: the symbol-cluster matcher ('g' flag; used with String#match -> stateless)
const reUnicode = RegExp(
  rsFitz + '(?=' + rsFitz + ')|' + rsSymbol + rsSeq,
  'g'
);

// reHasUnicode: presence check (no 'g' flag -> stateless .test)
const reHasUnicode = RegExp(
  '[' + rsZWJ + rsAstralRange + rsComboMarksRange + rsComboSymbolsRange + rsVarRange + ']'
);

// ---- helpers ----

function hasUnicode(string) {
  return reHasUnicode.test(string);
}

function unicodeToArray(string) {
  return string.match(reUnicode) || [];
}

function asciiToArray(string) {
  return string.split('');
}

function stringToArray(string) {
  return hasUnicode(string) ? unicodeToArray(string) : asciiToArray(string);
}

// isSymbol: typeof 'symbol', OR truthy object whose [[Class]] is '[object Symbol]'
function isSymbol(value) {
  const type = typeof value;
  if (type === 'symbol') return true;
  if (value && type === 'object' &&
      Object.prototype.toString.call(value) === '[object Symbol]') return true;
  return false;
}

// baseToString: lodash's internal string coercion
function baseToString(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    // Array elements are recursively coerced via Array#join semantics
    // (null/undefined elements join as ''); nested arrays are joined by native join
    return value.map(item => (item == null ? '' : baseToString(item))).join(',');
  }
  if (isSymbol(value)) {
    // Symbol#toString -> 'Symbol(desc)'
    return Symbol.prototype.toString.call(value);
  }
  // General coercion
  const result = String(value);
  // Negative-zero quirk: native (-0 + '') === '0'; lodash preserves the sign
  if (result === '0' && (1 / value) === -Infinity) return '-0';
  return result;
}

// lodash toString: null/undefined -> '', everything else -> baseToString
function toString(value) {
  if (value == null) return '';
  return baseToString(value);
}

// upperFirst: uppercase the first Unicode symbol cluster only
function upperFirst(string) {
  // toString is idempotent here (string is already a string), but we call it per spec
  string = toString(string);
  if (!string) return string;

  const useUnicode = hasUnicode(string);
  let chr, trailing;

  if (useUnicode) {
    const strSymbols = stringToArray(string);
    chr = strSymbols[0];
    trailing = strSymbols.slice(1).join('');
  } else {
    chr = string.charAt(0);
    trailing = string.slice(1);
  }

  return chr.toUpperCase() + trailing;
}

// ---- main export ----

function capitalize(string) {
  // Step 1: coerce
  const s0 = toString(string);
  // Step 2: lowercase entire string
  const s1 = s0.toLowerCase();
  // Step 3: uppercase first Unicode symbol cluster
  return upperFirst(s1);
}

export default capitalize;
