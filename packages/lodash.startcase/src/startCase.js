// @rederive/startCase — verified-recompose of lodash.startcase@4.4.0. quorum 3/3, differential 400/400, round 1. SIR: sir/startCase.sir
// Reconstructed from SIR contract: lodash.startcase@4.4.0

// ---- deburredLetters map ----
const deburredLetters = {
  // Latin-1 Supplement
  '\xc0': 'A', '\xc1': 'A', '\xc2': 'A', '\xc3': 'A', '\xc4': 'A', '\xc5': 'A',
  '\xc6': 'Ae',
  '\xc7': 'C',
  '\xc8': 'E', '\xc9': 'E', '\xca': 'E', '\xcb': 'E',
  '\xcc': 'I', '\xcd': 'I', '\xce': 'I', '\xcf': 'I',
  '\xd0': 'D',
  '\xd1': 'N',
  '\xd2': 'O', '\xd3': 'O', '\xd4': 'O', '\xd5': 'O', '\xd6': 'O',
  '\xd8': 'O',
  '\xd9': 'U', '\xda': 'U', '\xdb': 'U', '\xdc': 'U',
  '\xdd': 'Y',
  '\xde': 'Th',
  '\xdf': 'ss',
  '\xe0': 'a', '\xe1': 'a', '\xe2': 'a', '\xe3': 'a', '\xe4': 'a', '\xe5': 'a',
  '\xe6': 'ae',
  '\xe7': 'c',
  '\xe8': 'e', '\xe9': 'e', '\xea': 'e', '\xeb': 'e',
  '\xec': 'i', '\xed': 'i', '\xee': 'i', '\xef': 'i',
  '\xf0': 'd',
  '\xf1': 'n',
  '\xf2': 'o', '\xf3': 'o', '\xf4': 'o', '\xf5': 'o', '\xf6': 'o',
  '\xf8': 'o',
  '\xf9': 'u', '\xfa': 'u', '\xfb': 'u', '\xfc': 'u',
  '\xfd': 'y',
  '\xfe': 'th',
  '\xff': 'y',
  // Latin Extended-A
  'Ā': 'A', 'ā': 'a',
  'Ă': 'A', 'ă': 'a',
  'Ą': 'A', 'ą': 'a',
  'Ć': 'C', 'ć': 'c',
  'Ĉ': 'C', 'ĉ': 'c',
  'Ċ': 'C', 'ċ': 'c',
  'Č': 'C', 'č': 'c',
  'Ď': 'D', 'ď': 'd',
  'Đ': 'D', 'đ': 'd',
  'Ē': 'E', 'ē': 'e',
  'Ĕ': 'E', 'ĕ': 'e',
  'Ė': 'E', 'ė': 'e',
  'Ę': 'E', 'ę': 'e',
  'Ě': 'E', 'ě': 'e',
  'Ĝ': 'G', 'ĝ': 'g',
  'Ğ': 'G', 'ğ': 'g',
  'Ġ': 'G', 'ġ': 'g',
  'Ģ': 'G', 'ģ': 'g',
  'Ĥ': 'H', 'ĥ': 'h',
  'Ħ': 'H', 'ħ': 'h',
  'Ĩ': 'I', 'ĩ': 'i',
  'Ī': 'I', 'ī': 'i',
  'Ĭ': 'I', 'ĭ': 'i',
  'Į': 'I', 'į': 'i',
  'İ': 'I', 'ı': 'i',
  'Ĳ': 'IJ', 'ĳ': 'ij',
  'Ĵ': 'J', 'ĵ': 'j',
  'Ķ': 'K', 'ķ': 'k', 'ĸ': 'k',
  'Ĺ': 'L', 'ĺ': 'l',
  'Ļ': 'L', 'ļ': 'l',
  'Ľ': 'L', 'ľ': 'l',
  'Ŀ': 'L', 'ŀ': 'l',
  'Ł': 'L', 'ł': 'l',
  'Ń': 'N', 'ń': 'n',
  'Ņ': 'N', 'ņ': 'n',
  'Ň': 'N', 'ň': 'n',
  'ŉ': "'n",
  'Ŋ': 'N', 'ŋ': 'n',
  'Ō': 'O', 'ō': 'o',
  'Ŏ': 'O', 'ŏ': 'o',
  'Ő': 'O', 'ő': 'o',
  'Œ': 'Oe', 'œ': 'oe',
  'Ŕ': 'R', 'ŕ': 'r',
  'Ŗ': 'R', 'ŗ': 'r',
  'Ř': 'R', 'ř': 'r',
  'Ś': 'S', 'ś': 's',
  'Ŝ': 'S', 'ŝ': 's',
  'Ş': 'S', 'ş': 's',
  'Š': 'S', 'š': 's',
  'Ţ': 'T', 'ţ': 't',
  'Ť': 'T', 'ť': 't',
  'Ŧ': 'T', 'ŧ': 't',
  'Ũ': 'U', 'ũ': 'u',
  'Ū': 'U', 'ū': 'u',
  'Ŭ': 'U', 'ŭ': 'u',
  'Ů': 'U', 'ů': 'u',
  'Ű': 'U', 'ű': 'u',
  'Ų': 'U', 'ų': 'u',
  'Ŵ': 'W', 'ŵ': 'w',
  'Ŷ': 'Y', 'ŷ': 'y', 'Ÿ': 'Y',
  'Ź': 'Z', 'ź': 'z',
  'Ż': 'Z', 'ż': 'z',
  'Ž': 'Z', 'ž': 'z',
  'ſ': 'ss',
};

// ---- regex constants ----
const reLatin = /[\xc0-\xd6\xd8-\xf6\xf8-\xffĀ-ſ]/g;

// reComboMark: combining diacritical marks
const reComboMark = /[̀-ͯ︠-︣⃐-⃰]/g;

// reApos: ASCII apostrophe U+0027 and right single quote U+2019
const reApos = /['’]/g;

// reHasUnicodeWord
const reHasUnicodeWord = /[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/;

// reAsciiWord
const reAsciiWord = /[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g;

// reUnicodeWord — composed exactly as in the source
const rsAstralRange        = '\\ud800-\\udfff';
const rsComboMarksRange    = '\\u0300-\\u036f\\ufe20-\\ufe23';
const rsComboSymbolsRange  = '\\u20d0-\\u20f0';
const rsDingbatRange       = '\\u2700-\\u27bf';
const rsLowerRange         = 'a-z\\xdf-\\xf6\\xf8-\\xff';
const rsMathOpRange        = '\\xac\\xb1\\xd7\\xf7';
const rsNonCharRange       = '\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf';
const rsPunctuationRange   = '\\u2000-\\u206f';
const rsSpaceRange         = ' \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000';
const rsUpperRange         = 'A-Z\\xc0-\\xd6\\xd8-\\xde';
const rsVarRange           = '\\ufe0e\\ufe0f';
const rsBreakRange         = rsMathOpRange + rsNonCharRange + rsPunctuationRange + rsSpaceRange;

const rsApos       = "['\\u2019]";
const rsAstral     = '[' + rsAstralRange + ']';
const rsBreak      = '[' + rsBreakRange + ']';
const rsCombo      = '[' + rsComboMarksRange + rsComboSymbolsRange + ']';
const rsDigits     = '\\d+';
const rsDingbat    = '[' + rsDingbatRange + ']';
const rsLower      = '[' + rsLowerRange + ']';
const rsMisc       = '[^' + rsAstralRange + rsBreakRange + rsDigits + rsDingbatRange + rsLowerRange + rsUpperRange + ']';
const rsFitz       = '\\ud83c[\\udffb-\\udfff]';
const rsModifier   = '(?:' + rsCombo + '|' + rsFitz + ')';
const rsNonAstral  = '[^' + rsAstralRange + ']';
const rsRegional   = '(?:\\ud83c[\\udde6-\\uddff]){2}';
const rsSurrPair   = '[\\ud800-\\udbff][\\udc00-\\udfff]';
const rsUpper      = '[' + rsUpperRange + ']';
const rsZWJ        = '\\u200d';

const rsLowerMisc     = '(?:' + rsLower + '|' + rsMisc + ')';
const rsUpperMisc     = '(?:' + rsUpper + '|' + rsMisc + ')';
const rsOptLowerContr = '(?:' + rsApos + '(?:d|ll|m|re|s|t|ve))?';
const rsOptUpperContr = '(?:' + rsApos + '(?:D|LL|M|RE|S|T|VE))?';
const reOptMod        = rsModifier + '?';
const rsOptVar        = '[' + rsVarRange + ']?';
const rsOptJoin       = '(?:' + rsZWJ + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsOptVar + reOptMod + ')*';
const rsSeq           = rsOptVar + reOptMod + rsOptJoin;
const rsEmoji         = '(?:' + [rsDingbat, rsRegional, rsSurrPair].join('|') + ')' + rsSeq;

const reUnicodeWord = RegExp([
  rsUpper + '?' + rsLower + '+' + rsOptLowerContr + '(?=' + [rsBreak, rsUpper, '$'].join('|') + ')',
  rsUpperMisc + '+' + rsOptUpperContr + '(?=' + [rsBreak, rsUpper + rsLowerMisc, '$'].join('|') + ')',
  rsUpper + '?' + rsLowerMisc + '+' + rsOptLowerContr,
  rsUpper + '+' + rsOptUpperContr,
  rsDigits,
  rsEmoji
].join('|'), 'g');

// reHasUnicode for upperFirst (ZWJ, astral, combo marks, variation selectors)
const reHasUnicode = RegExp(
  '[' + rsZWJ + rsAstralRange + rsComboMarksRange + rsComboSymbolsRange + rsVarRange + ']'
);

// reUnicode for stringToArray (code-point-aware split)
const rsSymbol = '(?:' + [rsRegional, rsSurrPair, rsNonAstral].join('|') + ')' + rsSeq;
const reUnicodeForSplit = RegExp(
  rsFitz + '(?=' + rsFitz + ')|' + rsSymbol,
  'g'
);

// ---- helpers ----

function isSymbol(value) {
  const type = typeof value;
  return type === 'symbol' ||
    (!!value && type === 'object' && Object.prototype.toString.call(value) === '[object Symbol]');
}

function baseToString(value) {
  if (typeof value === 'string') return value;
  if (isSymbol(value)) {
    return (typeof Symbol !== 'undefined' && Symbol.prototype && Symbol.prototype.toString)
      ? Symbol.prototype.toString.call(value)
      : '';
  }
  const result = (value + '');
  return (result === '0' && (1 / value) === -Infinity) ? '-0' : result;
}

function toString(value) {
  if (value == null) return '';
  return baseToString(value);
}

function deburrLetter(ch) {
  return deburredLetters[ch];
}

function deburr(string) {
  string = toString(string);
  return string && string.replace(reLatin, deburrLetter).replace(reComboMark, '');
}

function hasUnicodeWord(string) {
  return reHasUnicodeWord.test(string);
}

function asciiWords(string) {
  return string.match(reAsciiWord) || [];
}

function unicodeWords(string) {
  return string.match(reUnicodeWord) || [];
}

function words(string) {
  string = toString(string);
  if (hasUnicodeWord(string)) {
    return unicodeWords(string);
  }
  return asciiWords(string);
}

function hasUnicode(string) {
  return reHasUnicode.test(string);
}

function unicodeToArray(string) {
  return string.match(reUnicodeForSplit) || [];
}

function castSlice(array, start, end) {
  const length = array.length;
  end = end === undefined ? length : end;
  if (!start && end >= length) return array;
  return array.slice(start, end);
}

function upperFirst(string) {
  string = toString(string);
  if (!string) return string;
  const strSymbols = hasUnicode(string) ? unicodeToArray(string) : undefined;
  const chr = strSymbols ? strSymbols[0] : string.charAt(0);
  const trailing = strSymbols ? castSlice(strSymbols, 1).join('') : string.slice(1);
  return chr.toUpperCase() + trailing;
}

// ---- main function ----

function startCase(string) {
  if (string === undefined) string = '';
  const s0 = deburr(string);
  const s1 = s0.replace(reApos, '');
  const w = words(s1);
  let result = '';
  for (let i = 0; i < w.length; i++) {
    result = result + (i ? ' ' : '') + upperFirst(w[i]);
  }
  return result;
}

export default startCase;
