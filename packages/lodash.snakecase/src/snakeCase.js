// @rederive/snakeCase — verified-recompose of lodash.snakecase@4.1.1. quorum 3/3, differential 400/400, round 1. SIR: sir/snakeCase.sir
// Blind clean-room re-emission of lodash.snakeCase@4.1.1
// Reconstructed solely from snakeCase.sir + frozen.md

// =====================================================================================
// DEBURR TABLE (deburredLetters) — verbatim from SIR STAGE 1
// =====================================================================================
const deburredLetters = {
  // Latin-1 Supplement
  '\xc0': 'A',  '\xc1': 'A',  '\xc2': 'A',  '\xc3': 'A',  '\xc4': 'A',  '\xc5': 'A',
  '\xe0': 'a',  '\xe1': 'a',  '\xe2': 'a',  '\xe3': 'a',  '\xe4': 'a',  '\xe5': 'a',
  '\xc7': 'C',  '\xe7': 'c',
  '\xd0': 'D',  '\xf0': 'd',
  '\xc8': 'E',  '\xc9': 'E',  '\xca': 'E',  '\xcb': 'E',
  '\xe8': 'e',  '\xe9': 'e',  '\xea': 'e',  '\xeb': 'e',
  '\xcc': 'I',  '\xcd': 'I',  '\xce': 'I',  '\xcf': 'I',
  '\xec': 'i',  '\xed': 'i',  '\xee': 'i',  '\xef': 'i',
  '\xd1': 'N',  '\xf1': 'n',
  '\xd2': 'O',  '\xd3': 'O',  '\xd4': 'O',  '\xd5': 'O',  '\xd6': 'O',  '\xd8': 'O',
  '\xf2': 'o',  '\xf3': 'o',  '\xf4': 'o',  '\xf5': 'o',  '\xf6': 'o',  '\xf8': 'o',
  '\xd9': 'U',  '\xda': 'U',  '\xdb': 'U',  '\xdc': 'U',
  '\xf9': 'u',  '\xfa': 'u',  '\xfb': 'u',  '\xfc': 'u',
  '\xdd': 'Y',  '\xfd': 'y',  '\xff': 'y',
  '\xc6': 'Ae', '\xe6': 'ae',
  '\xde': 'Th', '\xfe': 'th',
  '\xdf': 'ss',
  // Latin Extended-A: Ā-ſ (U+0100 - U+017F)
  'Ā': 'A',  'Ă': 'A',  'Ą': 'A',
  'ā': 'a',  'ă': 'a',  'ą': 'a',
  'Ć': 'C',  'Ĉ': 'C',  'Ċ': 'C',  'Č': 'C',
  'ć': 'c',  'ĉ': 'c',  'ċ': 'c',  'č': 'c',
  'Ď': 'D',  'Đ': 'D',  'ď': 'd',  'đ': 'd',
  'Ē': 'E',  'Ĕ': 'E',  'Ė': 'E',  'Ę': 'E',  'Ě': 'E',
  'ē': 'e',  'ĕ': 'e',  'ė': 'e',  'ę': 'e',  'ě': 'e',
  'Ĝ': 'G',  'Ğ': 'G',  'Ġ': 'G',  'Ģ': 'G',
  'ĝ': 'g',  'ğ': 'g',  'ġ': 'g',  'ģ': 'g',
  'Ĥ': 'H',  'Ħ': 'H',  'ĥ': 'h',  'ħ': 'h',
  'Ĩ': 'I',  'Ī': 'I',  'Ĭ': 'I',  'Į': 'I',  'İ': 'I',
  'ĩ': 'i',  'ī': 'i',  'ĭ': 'i',  'į': 'i',  'ı': 'i',
  'Ĵ': 'J',  'ĵ': 'j',
  'Ķ': 'K',  'ķ': 'k',  'ĸ': 'k',
  'Ĺ': 'L',  'Ļ': 'L',  'Ľ': 'L',  'Ŀ': 'L',  'Ł': 'L',
  'ĺ': 'l',  'ļ': 'l',  'ľ': 'l',  'ŀ': 'l',  'ł': 'l',
  'Ń': 'N',  'Ņ': 'N',  'Ň': 'N',  'Ŋ': 'N',
  'ń': 'n',  'ņ': 'n',  'ň': 'n',  'ŋ': 'n',
  'Ō': 'O',  'Ŏ': 'O',  'Ő': 'O',
  'ō': 'o',  'ŏ': 'o',  'ő': 'o',
  'Ŕ': 'R',  'Ŗ': 'R',  'Ř': 'R',
  'ŕ': 'r',  'ŗ': 'r',  'ř': 'r',
  'Ś': 'S',  'Ŝ': 'S',  'Ş': 'S',  'Š': 'S',
  'ś': 's',  'ŝ': 's',  'ş': 's',  'š': 's',
  'Ţ': 'T',  'Ť': 'T',  'Ŧ': 'T',
  'ţ': 't',  'ť': 't',  'ŧ': 't',
  'Ũ': 'U',  'Ū': 'U',  'Ŭ': 'U',  'Ů': 'U',  'Ű': 'U',  'Ų': 'U',
  'ũ': 'u',  'ū': 'u',  'ŭ': 'u',  'ů': 'u',  'ű': 'u',  'ų': 'u',
  'Ŵ': 'W',  'ŵ': 'w',
  'Ŷ': 'Y',  'ŷ': 'y',  'Ÿ': 'Y',
  'Ź': 'Z',  'Ż': 'Z',  'Ž': 'Z',
  'ź': 'z',  'ż': 'z',  'ž': 'z',
  'Ĳ': 'IJ', 'ĳ': 'ij',
  'Œ': 'Oe', 'œ': 'oe',
  'ŉ': "'n",  // ŉ -> apostrophe + n (apostrophe stripped later by STAGE 2)
  'ſ': 'ss',  // ſ -> 'ss'
};

// =====================================================================================
// REGEX FRAGMENTS — verbatim from SIR
// =====================================================================================
const rsAstralRange       = '\ud800-\udfff';
const rsComboMarksRange   = '̀-ͯ︠-︣';
const rsComboSymbolsRange = '⃐-⃰';
const rsDingbatRange      = '✀-➿';
const rsLowerRange        = 'a-z\xdf-\xf6\xf8-\xff';
const rsMathOpRange       = '\xac\xb1\xd7\xf7';
const rsNonCharRange      = '\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\xbf';
const rsPunctuationRange  = ' -⁯';
const rsSpaceRange        = ' \t\x0b\f\xa0﻿\n\r   ᠎             　';
const rsUpperRange        = 'A-Z\xc0-\xd6\xd8-\xde';
const rsVarRange          = '︎️';
const rsBreakRange        = rsMathOpRange + rsNonCharRange + rsPunctuationRange + rsSpaceRange;

const rsApos        = "['\\u2019]";
const rsBreak       = '[' + rsBreakRange + ']';
const rsCombo       = '[' + rsComboMarksRange + rsComboSymbolsRange + ']';
const rsDigits      = '\\d+';
const rsDingbat     = '[' + rsDingbatRange + ']';
const rsLower       = '[' + rsLowerRange + ']';
const rsMisc        = '[^' + rsAstralRange + rsBreakRange + rsDigits + rsDingbatRange + rsLowerRange + rsUpperRange + ']';
const rsFitz        = '\\ud83c[\\udffb-\\udfff]';
const rsModifier    = '(?:' + rsCombo + '|' + rsFitz + ')';
const rsNonAstral   = '[^' + rsAstralRange + ']';
const rsRegional    = '(?:\\ud83c[\\udde6-\\uddff]){2}';
const rsSurrPair    = '[\\ud800-\\udbff][\\udc00-\\udfff]';
const rsUpper       = '[' + rsUpperRange + ']';
const rsZWJ         = '\\u200d';

const rsLowerMisc   = '(?:' + rsLower + '|' + rsMisc + ')';
const rsUpperMisc   = '(?:' + rsUpper + '|' + rsMisc + ')';
const rsOptLowerContr = '(?:' + rsApos + '(?:d|ll|m|re|s|t|ve))?';
const rsOptUpperContr = '(?:' + rsApos + '(?:D|LL|M|RE|S|T|VE))?';
const reOptMod      = rsModifier + '?';
const rsOptVar      = '[' + rsVarRange + ']?';
const rsOptJoin     = '(?:' + rsZWJ + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsOptVar + reOptMod + ')*';
const rsSeq         = rsOptVar + reOptMod + rsOptJoin;
const rsEmoji       = '(?:' + [rsDingbat, rsRegional, rsSurrPair].join('|') + ')' + rsSeq;

// =====================================================================================
// COMPILED REGEXES
// =====================================================================================
const reLatin      = /[\xc0-\xd6\xd8-\xf6\xf8-\xffĀ-ſ]/g;
const reComboMark  = RegExp(rsCombo, 'g');
const reApos       = RegExp(rsApos, 'g');
const reAsciiWord  = /[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g;
const reHasUnicodeWord = /[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/;

const reUnicodeWord = RegExp([
  rsUpper + '?' + rsLower + '+' + rsOptLowerContr + '(?=' + [rsBreak, rsUpper, '$'].join('|') + ')',
  rsUpperMisc + '+' + rsOptUpperContr + '(?=' + [rsBreak, rsUpper + rsLowerMisc, '$'].join('|') + ')',
  rsUpper + '?' + rsLowerMisc + '+' + rsOptLowerContr,
  rsUpper + '+' + rsOptUpperContr,
  rsDigits,
  rsEmoji
].join('|'), 'g');

// =====================================================================================
// HELPERS
// =====================================================================================

// deburrLetter: replacement function for reLatin
function deburrLetter(chr) {
  return deburredLetters[chr] || chr;
}

// STAGE 1: deburr
function deburr(string) {
  // falsy short-circuit: '' returns ''
  return string && string.replace(reLatin, deburrLetter).replace(reComboMark, '');
}

// STAGE 3: word splitting
function unicodeWords(string) {
  return string.match(reUnicodeWord) || [];
}

function asciiWords(string) {
  return string.match(reAsciiWord) || [];
}

function hasUnicodeWord(string) {
  return reHasUnicodeWord.test(string);
}

function words(string) {
  return hasUnicodeWord(string) ? unicodeWords(string) : asciiWords(string);
}

// STAGE 0: toString coercion
function toString(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'symbol') return Symbol.prototype.toString.call(value);
  const result = String(value);
  return (result === '0' && (1 / value) === -Infinity) ? '-0' : result;
}

// =====================================================================================
// MAIN EXPORT: snakeCase
// =====================================================================================
function snakeCase(string) {
  // STAGE 0: coerce to string
  const s = toString(string === undefined ? '' : string);

  // STAGE 1: deburr (with '' short-circuit)
  const d = deburr(s) || '';

  // STAGE 2: strip apostrophes
  const a = d.replace(reApos, '');

  // STAGE 3: split into words
  const wordsList = words(a);

  // STAGE 4: lowercase each word and join with '_'
  return wordsList.reduce((result, word, index) => {
    return result + (index ? '_' : '') + word.toLowerCase();
  }, '');
}

export default snakeCase;
