// @rederive/deburr — verified-recompose of lodash.deburr@4.1.0. quorum 3/3, differential 400/400, round 1. SIR: sir/deburr.sir
// Clean-room re-emission of lodash.deburr@4.1.0
// Reconstructed purely from the SIR contract — no original source consulted.

const deburredLetters = {
  // Latin-1 Supplement block
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
  // Latin Extended-A block
  'Ā': 'A', 'Ă': 'A', 'Ą': 'A',
  'ā': 'a', 'ă': 'a', 'ą': 'a',
  'Ć': 'C', 'Ĉ': 'C', 'Ċ': 'C', 'Č': 'C',
  'ć': 'c', 'ĉ': 'c', 'ċ': 'c', 'č': 'c',
  'Ď': 'D', 'Đ': 'D', 'ď': 'd', 'đ': 'd',
  'Ē': 'E', 'Ĕ': 'E', 'Ė': 'E', 'Ę': 'E', 'Ě': 'E',
  'ē': 'e', 'ĕ': 'e', 'ė': 'e', 'ę': 'e', 'ě': 'e',
  'Ĝ': 'G', 'Ğ': 'G', 'Ġ': 'G', 'Ģ': 'G',
  'ĝ': 'g', 'ğ': 'g', 'ġ': 'g', 'ģ': 'g',
  'Ĥ': 'H', 'Ħ': 'H', 'ĥ': 'h', 'ħ': 'h',
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

// reLatin matches the union of ranges: U+00C0-U+00D6, U+00D8-U+00F6, U+00F8-U+00FF, U+0100-U+017F
const reLatin = /[\xc0-\xd6\xd8-\xf6\xf8-\xffĀ-ſ]/g;

// reComboMark strips combining diacritical marks from three ranges
const reComboMark = RegExp('[̀-ͯ︠-︣⃐-⃰]', 'g');

// deburrLetter: basePropertyOf(deburredLetters) — lookup in the map
function deburrLetter(key) {
  return deburredLetters[key];
}

// lodash toString / baseToString semantics
function toString(value) {
  if (value == null) return '';
  return baseToString(value);
}

function baseToString(value) {
  if (typeof value === 'string') return value;
  // Symbol check: Symbol primitive or boxed Symbol object
  if (typeof value === 'symbol') {
    return Symbol.prototype.toString ? Symbol.prototype.toString.call(value) : '';
  }
  if (value !== null && typeof value === 'object') {
    const tag = Object.prototype.toString.call(value);
    if (tag === '[object Symbol]') {
      return Symbol.prototype.toString ? Symbol.prototype.toString.call(value) : '';
    }
  }
  // Default JS string coercion
  const result = (value + '');
  // Preserve sign of -0
  return (result === '0' && (1 / value) === -Infinity) ? '-0' : result;
}

function deburr(string) {
  string = toString(string);
  return string && string.replace(reLatin, deburrLetter).replace(reComboMark, '');
}

export default deburr;
