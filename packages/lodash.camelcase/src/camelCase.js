// @rederive/camelCase — verified-recompose of lodash.camelcase@4.3.0. quorum 3/3, differential 400/400, round 1. SIR: sir/camelCase.sir
// Clean-room re-emission of lodash.camelCase (lodash.camelcase@4.3.0)
// Reconstructed from SIR contract + frozen oracle. No external dependencies.

// ----------------------------------------------------------------------------
// NODE 1 — toString coercion (lodash baseToString)
// ----------------------------------------------------------------------------
function baseToString(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  // Check for -0
  const result = String(value);
  if (result === '0' && (1 / value) === -Infinity) return '-0';
  return result;
}

// ----------------------------------------------------------------------------
// NODE 2a — deburredLetters map (transcribed verbatim from SIR)
// ----------------------------------------------------------------------------
const deburredLetters = {
  // Latin-1 Supplement
  '\xC0': 'A', '\xC1': 'A', '\xC2': 'A', '\xC3': 'A', '\xC4': 'A', '\xC5': 'A',
  '\xE0': 'a', '\xE1': 'a', '\xE2': 'a', '\xE3': 'a', '\xE4': 'a', '\xE5': 'a',
  '\xC7': 'C', '\xE7': 'c',
  '\xD0': 'D', '\xF0': 'd',
  '\xC8': 'E', '\xC9': 'E', '\xCA': 'E', '\xCB': 'E',
  '\xE8': 'e', '\xE9': 'e', '\xEA': 'e', '\xEB': 'e',
  '\xCC': 'I', '\xCD': 'I', '\xCE': 'I', '\xCF': 'I',
  '\xEC': 'i', '\xED': 'i', '\xEE': 'i', '\xEF': 'i',
  '\xD1': 'N', '\xF1': 'n',
  '\xD2': 'O', '\xD3': 'O', '\xD4': 'O', '\xD5': 'O', '\xD6': 'O', '\xD8': 'O',
  '\xF2': 'o', '\xF3': 'o', '\xF4': 'o', '\xF5': 'o', '\xF6': 'o', '\xF8': 'o',
  '\xD9': 'U', '\xDA': 'U', '\xDB': 'U', '\xDC': 'U',
  '\xF9': 'u', '\xFA': 'u', '\xFB': 'u', '\xFC': 'u',
  '\xDD': 'Y', '\xFD': 'y', '\xFF': 'y',
  '\xC6': 'Ae', '\xE6': 'ae',
  '\xDE': 'Th', '\xFE': 'th',
  '\xDF': 'ss',
  // Latin Extended-A (U+0100..U+017F)
  'Ā': 'A', 'Ă': 'A', 'Ą': 'A',
  'ā': 'a', 'ă': 'a', 'ą': 'a',
  'Ć': 'C', 'Ĉ': 'C', 'Ċ': 'C', 'Č': 'C',
  'ć': 'c', 'ĉ': 'c', 'ċ': 'c', 'č': 'c',
  'Ď': 'D', 'Đ': 'D',
  'ď': 'd', 'đ': 'd',
  'Ē': 'E', 'Ĕ': 'E', 'Ė': 'E', 'Ę': 'E', 'Ě': 'E',
  'ē': 'e', 'ĕ': 'e', 'ė': 'e', 'ę': 'e', 'ě': 'e',
  'Ĝ': 'G', 'Ğ': 'G', 'Ġ': 'G', 'Ģ': 'G',
  'ĝ': 'g', 'ğ': 'g', 'ġ': 'g', 'ģ': 'g',
  'Ĥ': 'H', 'Ħ': 'H',
  'ĥ': 'h', 'ħ': 'h',
  'Ĩ': 'I', 'Ī': 'I', 'Ĭ': 'I', 'Į': 'I', 'İ': 'I',
  'ĩ': 'i', 'ī': 'i', 'ĭ': 'i', 'į': 'i', 'ı': 'i',
  'Ĵ': 'J', 'ĵ': 'j',
  'Ķ': 'K', 'ķ': 'k', 'ĸ': 'k',
  'Ĺ': 'L', 'Ļ': 'L', 'Ľ': 'L', 'Ŀ': 'L', 'Ł': 'L',
  'ĺ': 'l', 'ļ': 'l', 'ľ': 'l', 'ŀ': 'l', 'ł': 'l',
  'Ń': 'N', 'Ņ': 'N', 'Ň': 'N', 'Ŋ': 'N',
  'ń': 'n', 'ņ': 'n', 'ň': 'n', 'ŋ': 'n',
  'Ō': 'O', 'Ŏ': 'O', 'Ő': 'O',
  'ō': 'o', 'ŏ': 'o', 'ő': 'o',
  'Ŕ': 'R', 'Ŗ': 'R', 'Ř': 'R',
  'ŕ': 'r', 'ŗ': 'r', 'ř': 'r',
  'Ś': 'S', 'Ŝ': 'S', 'Ş': 'S', 'Š': 'S',
  'ś': 's', 'ŝ': 's', 'ş': 's', 'š': 's',
  'Ţ': 'T', 'Ť': 'T', 'Ŧ': 'T',
  'ţ': 't', 'ť': 't', 'ŧ': 't',
  'Ũ': 'U', 'Ū': 'U', 'Ŭ': 'U', 'Ů': 'U', 'Ű': 'U', 'Ų': 'U',
  'ũ': 'u', 'ū': 'u', 'ŭ': 'u', 'ů': 'u', 'ű': 'u', 'ų': 'u',
  'Ŵ': 'W', 'ŵ': 'w',
  'Ŷ': 'Y', 'ŷ': 'y', 'Ÿ': 'Y',
  'Ź': 'Z', 'Ż': 'Z', 'Ž': 'Z',
  'ź': 'z', 'ż': 'z', 'ž': 'z',
  'Ĳ': 'IJ', 'ĳ': 'ij',
  'Œ': 'Oe', 'œ': 'oe',
  'ŉ': "'n", 'ſ': 'ss',
};

// NODE 2 — deburr
const reLatin = /[\xC0-\xD6\xD8-\xF6\xF8-\xFFĀ-ſ]/g;
const reComboMark = /[̀-ͯ︠-︣⃐-⃰]/g;

function deburr(s) {
  // lodash deburr: `string && string.replace(reLatin, deburrLetter).replace(reComboMark, '')`
  return s && s.replace(reLatin, function(chr) { return deburredLetters[chr] || chr; }).replace(reComboMark, '');
}

// NODE 3 — strip apostrophes
// reApos = /['’]/g  (ASCII apostrophe U+0027 + right single quote U+2019)
const reApos = /['’]/g;

// NODE 4 — words

// 4a. Fast-path selector
const reHasUnicodeWord = /[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/;

// 4b. ASCII words path
const reAsciiWord = /[^\x00-\x2F\x3A-\x40\x5B-\x60\x7B-\x7F]+/g;

// 4c. Unicode words path — build the regex from the exact source constants
const rsAstralRange       = '\uD800-\uDFFF';
const rsComboMarksRange   = '̀-ͯ︠-︣';
const rsComboSymbolsRange = '⃐-⃰';
const rsDingbatRange      = '✀-➿';
const rsLowerRange        = 'a-z\xDF-\xF6\xF8-\xFF';
const rsMathOpRange       = '\xAC\xB1\xD7\xF7';
const rsNonCharRange      = '\x00-\x2F\x3A-\x40\x5B-\x60\x7B-\xBF';
const rsPunctuationRange  = ' -⁯';
const rsSpaceRange        = ' \t\x0B\f\xA0﻿\n\r   ᠎             　';
const rsUpperRange        = 'A-Z\xC0-\xD6\xD8-\xDE';
const rsVarRange          = '︎️';
const rsBreakRange        = rsMathOpRange + rsNonCharRange + rsPunctuationRange + rsSpaceRange;

const rsApos    = "[''’]";
const rsBreak   = '[' + rsBreakRange + ']';
const rsCombo   = '[' + rsComboMarksRange + rsComboSymbolsRange + ']';
const rsDigits  = '\\d+';
const rsDingbat = '[' + rsDingbatRange + ']';
const rsLower   = '[' + rsLowerRange + ']';
const rsMisc    = '[^' + rsAstralRange + rsBreakRange + '\\d' + rsDingbatRange + rsLowerRange + rsUpperRange + ']';
const rsFitz    = '\uD83C[\uDFFB-\uDFFF]';
const rsModifier = '(?:' + rsCombo + '|' + rsFitz + ')';
const rsNonAstral = '[^' + rsAstralRange + ']';
const rsRegional  = '(?:\uD83C[\uDDE6-\uDDFF]){2}';
const rsSurrPair  = '[\uD800-\uDBFF][\uDC00-\uDFFF]';
const rsUpper   = '[' + rsUpperRange + ']';
const rsZWJ     = '‍';

const rsLowerMisc = '(?:' + rsLower + '|' + rsMisc + ')';
const rsUpperMisc = '(?:' + rsUpper + '|' + rsMisc + ')';
const rsOptLowerContr = "(?:['’](?:d|ll|m|re|s|t|ve))?";
const rsOptUpperContr = "(?:['’](?:D|LL|M|RE|S|T|VE))?";
const reOptMod  = rsModifier + '?';
const rsOptVar  = '[' + rsVarRange + ']?';
const rsOptJoin = '(?:' + rsZWJ + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsOptVar + reOptMod + ')*';
const rsSeq     = rsOptVar + reOptMod + rsOptJoin;
const rsEmoji   = '(?:' + [rsDingbat, rsRegional, rsSurrPair].join('|') + ')' + rsSeq;

// 6 branch alternation (B1..B6)
const reUnicodeWord = RegExp(
  rsUpper + '?' + rsLower + '+' + rsOptLowerContr + '(?=' + rsBreak + '|' + rsUpper + '|$)' + '|' +
  rsUpperMisc + '+' + rsOptUpperContr + '(?=' + rsBreak + '|' + rsUpper + rsLowerMisc + '|$)' + '|' +
  rsUpper + '?' + rsLowerMisc + '+' + rsOptLowerContr + '|' +
  rsUpper + '+' + rsOptUpperContr + '|' +
  rsDigits + '|' +
  rsEmoji,
  'g'
);

function unicodeWords(string) {
  return string.match(reUnicodeWord) || [];
}

function asciiWords(string) {
  return string.match(reAsciiWord) || [];
}

function words(string) {
  if (reHasUnicodeWord.test(string)) {
    return unicodeWords(string);
  }
  return asciiWords(string);
}

// NODE 5 — upperFirst (createCaseFirst('toUpperCase'))
// hasUnicode check for surrogate-aware splitting
const reHasUnicode = RegExp(
  '[' + rsZWJ + rsAstralRange + rsComboMarksRange + rsComboSymbolsRange + rsVarRange + ']'
);

const reUnicode = RegExp(
  rsFitz + '(?=' + rsFitz + ')' + '|' +
  '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsSeq,
  'g'
);

function hasUnicode(string) {
  return reHasUnicode.test(string);
}

function stringToArray(string) {
  return hasUnicode(string)
    ? (string.match(reUnicode) || [])
    : string.split('');
}

function upperFirst(s) {
  if (!s) return s;
  if (hasUnicode(s)) {
    const arr = stringToArray(s);
    const first = arr[0];
    const rest = arr.slice(1).join('');
    return first.toUpperCase() + rest;
  }
  const chr = s.charAt(0);
  const trailing = s.slice(1);
  return chr.toUpperCase() + trailing;
}

function capitalize(word) {
  const lw = word.toLowerCase();
  return upperFirst(lw);
}

// ----------------------------------------------------------------------------
// camelCase — main function
// ----------------------------------------------------------------------------
function camelCase(string) {
  // NODE 1: toString coercion
  const s = baseToString(string);

  // NODE 2: deburr
  const deburred = deburr(s) || '';

  // NODE 3: strip apostrophes
  const stripped = deburred.replace(reApos, '');

  // NODE 4: split into words
  const wordList = words(stripped);

  // NODE 5: fold
  let result = '';
  for (let i = 0; i < wordList.length; i++) {
    const w = wordList[i];
    const lw = w.toLowerCase();
    if (i === 0) {
      result += lw;
    } else {
      result += capitalize(w);
    }
  }
  return result;
}

export default camelCase;
