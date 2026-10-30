// @rederive/kebabCase — verified-recompose of lodash.kebabcase@4.1.1. quorum 2/3, differential 400/400, round 1. SIR: sir/kebabCase.sir
// Clean-room re-emission of lodash.kebabcase@4.1.1 — kebabCase
// Reconstructed solely from the SIR behavioral contract. Zero dependencies.

export default function kebabCase(string) {
  // NODE 1 — coerce to string
  if (string == null) {
    string = '';
  } else if (typeof string !== 'string') {
    // baseToString: -0 -> '-0', else value + ''
    if (typeof string === 'object' && string !== null) {
      const tag = Object.prototype.toString.call(string);
      if (tag === '[object Symbol]') {
        string = string.toString();
      } else {
        const val = string.valueOf();
        string = val !== string ? String(val) : String(string);
      }
    } else {
      // handle -0
      if (string === 0 && (1 / string) === -Infinity) {
        string = '-0';
      } else {
        string = String(string);
      }
    }
  }

  // Short-circuit for empty string (the `string && ...` guard)
  if (!string) {
    return '';
  }

  // NODE 2 — deburr(string)
  // 2b. Replace Latin chars via reLatin
  const reLatin = /[\xc0-\xd6\xd8-\xf6\xf8-\xffĀ-ſ]/g;

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
    // gap: \xd7 (×) not in reLatin
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
    // gap: \xf7 (÷) not in reLatin
    '\xf8': 'o',
    '\xf9': 'u', '\xfa': 'u', '\xfb': 'u', '\xfc': 'u',
    '\xfd': 'y',
    '\xfe': 'th',
    '\xff': 'y',

    // Latin Extended-A (U+0100..U+017F)
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

  string = string.replace(reLatin, function(chr) {
    return deburredLetters[chr] || chr;
  });

  // 2c. Remove combining diacritical marks
  // reComboMark = /[̀-ͯ︠-︣⃐-⃰]/g
  const reComboMark = /[̀-ͯ︠-︣⃐-⃰]/g;
  string = string.replace(reComboMark, '');

  // NODE 3 — strip apostrophes (ASCII ' U+0027 and RIGHT SINGLE QUOTATION MARK U+2019)
  const reApos = /['’]/g;
  string = string.replace(reApos, '');

  // NODE 4 — choose word-splitter
  // reHasUnicodeWord (no global flag — just .test())
  const reHasUnicodeWord = /[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/;

  let words;
  if (reHasUnicodeWord.test(string)) {
    // NODE 5 — UNICODE word path
    words = unicodeWords(string);
  } else {
    // NODE 6 — ASCII word path
    const reAsciiWord = /[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g;
    words = string.match(reAsciiWord) || [];
  }

  // NODE 7 — reduce + lowercase + join with '-'
  let result = '';
  for (let i = 0; i < words.length; i++) {
    result += (i === 0 ? '' : '-') + words[i].toLowerCase();
  }
  return result;
}

// ============================================================
// unicodeWords — NODE 5 implementation
// ============================================================
function unicodeWords(string) {
  // Building blocks (as strings for composing the regex source):
  const rsApos = "['\\u2019]";

  // Break range chars: ¬(ac) ±(b1) ×(d7) ÷(f7), then ASCII control/punct/space ranges,
  // then general punctuation (U+2000..U+206F), space chars, and more.
  const rsBreakRange =
    '\\xac\\xb1\\xd7\\xf7' +
    '\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf' +
    '\\u2000-\\u206f' +
    ' \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000';

  const rsLowerRange = 'a-z\\xdf-\\xf6\\xf8-\\xff';
  const rsUpperRange = 'A-Z\\xc0-\\xd6\\xd8-\\xde';
  const rsDigits = '\\d+';
  const rsDingbatRange = '\\u2700-\\u27bf';
  const rsAstralRange = '\\ud800-\\udfff';

  const rsBreak = '[' + rsBreakRange + ']';
  const rsDigit = '\\d';
  const rsLower = '[' + rsLowerRange + ']';
  const rsUpper = '[' + rsUpperRange + ']';

  // rsMisc: any char that is NOT astral, NOT break, NOT digit, NOT dingbat, NOT lower-range, NOT upper-range
  const rsMisc =
    '[^' +
    rsAstralRange +
    rsBreakRange +
    '\\d' +
    rsDingbatRange +
    rsLowerRange +
    rsUpperRange +
    ']';

  const rsMiscLower = '(?:' + rsLower + '|' + rsMisc + ')';
  const rsMiscUpper = '(?:' + rsUpper + '|' + rsMisc + ')';

  const rsOptLowerContr = '(?:' + rsApos + '(?:d|ll|m|re|s|t|ve))?';
  const rsOptUpperContr = '(?:' + rsApos + '(?:D|LL|M|RE|S|T|VE))?';

  // Emoji building blocks
  const rsCombo = '[\\u0300-\\u036f\\ufe20-\\ufe2f\\u20d0-\\u20ff]';
  const rsFitz = '\\ud83c[\\udffb-\\udfff]';
  const rsModifier = '(?:' + rsCombo + '|' + rsFitz + ')';
  const rsZWJ = '\\u200d';
  const rsRegional = '(?:\\ud83c[\\udde6-\\uddff]){2}';
  const rsSurrPair = '[\\ud800-\\udbff][\\udc00-\\udfff]';
  const rsDingbat = '[' + rsDingbatRange + ']';
  const rsSeq = rsModifier + '?|[' + rsDingbatRange + ']' + rsModifier + '?|(?:' + rsZWJ + '(?:' + [rsSurrPair, rsDingbat].join('|') + ')' + rsModifier + '?)+';
  const rsEmoji = '(?:' + [rsDingbat, rsRegional, rsSurrPair].join('|') + ')' + rsSeq;

  // A1: rsUpper? rsLower+ rsOptLowerContr (?= rsBreak | rsUpper | $ )
  const A1 =
    rsUpper + '?' + rsLower + '+' + rsOptLowerContr +
    '(?=' + rsBreak + '|' + rsUpper + '|$)';

  // A2: rsMiscUpper+ rsOptUpperContr (?= rsBreak | rsUpper rsMiscLower | $ )
  const A2 =
    rsMiscUpper + '+' + rsOptUpperContr +
    '(?=' + rsBreak + '|' + rsUpper + rsMiscLower + '|$)';

  // A3: rsUpper? rsMiscLower+ rsOptLowerContr
  const A3 =
    rsUpper + '?' + rsMiscLower + '+' + rsOptLowerContr;

  // A4: rsUpper+ rsOptUpperContr
  const A4 =
    rsUpper + '+' + rsOptUpperContr;

  // A5: rsDigits
  const A5 = rsDigits;

  // A6: rsEmoji
  const A6 = rsEmoji;

  const reUnicodeWordSource =
    A1 + '|' + A2 + '|' + A3 + '|' + A4 + '|' + A5 + '|' + A6;

  const reUnicodeWord = new RegExp(reUnicodeWordSource, 'g');

  return string.match(reUnicodeWord) || [];
}
