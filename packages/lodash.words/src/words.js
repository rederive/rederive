// @rederive/words — verified-recompose of lodash.words@4.2.0. quorum 3/3, differential 400/400, round 1. SIR: sir/words.sir
// Clean-room re-emission of lodash.words@4.2.0 — reconstructed from SIR contract alone.

// ── toString (B0) ─────────────────────────────────────────────────────────────
function toString(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'symbol') return Symbol.prototype.toString.call(value);
  if (typeof value === 'object' &&
      Object.prototype.toString.call(value) === '[object Symbol]') {
    return Symbol.prototype.toString.call(value);
  }
  const result = String(value);
  if (result === '0' && (1 / value) === -Infinity) return '-0';
  return result;
}

// ── reHasUnicodeWord (B3) ──────────────────────────────────────────────────────
const reHasUnicodeWord = /[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/;

// ── reAsciiWord (B4) ───────────────────────────────────────────────────────────
const reAsciiWord = /[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g;

// ── reUnicodeWord (B5) — recomposed from named pieces per SIR ─────────────────
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

const rsApos     = "['\\u2019]";
const rsBreak    = '[' + rsBreakRange + ']';
const rsCombo    = '[' + rsComboMarksRange + rsComboSymbolsRange + ']';
const rsDigits   = '\\d+';
const rsDingbat  = '[' + rsDingbatRange + ']';
const rsLower    = '[' + rsLowerRange + ']';
const rsMisc     = '[^' + rsAstralRange + rsBreakRange + rsDigits + rsDingbatRange + rsLowerRange + rsUpperRange + ']';
const rsFitz     = '\\ud83c[\\udffb-\\udfff]';
const rsModifier = '(?:' + rsCombo + '|' + rsFitz + ')';
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

const reUnicodeWord = RegExp(
  [
    rsUpper + '?' + rsLower + '+' + rsOptLowerContr +
      '(?=' + [rsBreak, rsUpper, '$'].join('|') + ')',
    rsUpperMisc + '+' + rsOptUpperContr +
      '(?=' + [rsBreak, rsUpper + rsLowerMisc, '$'].join('|') + ')',
    rsUpper + '?' + rsLowerMisc + '+' + rsOptLowerContr,
    rsUpper + '+' + rsOptUpperContr,
    rsDigits,
    rsEmoji,
  ].join('|'),
  'g'
);

// ── hasUnicodeWord (B3) ────────────────────────────────────────────────────────
function hasUnicodeWord(str) {
  return reHasUnicodeWord.test(str);
}

// ── unicodeWords (B5) ─────────────────────────────────────────────────────────
function unicodeWords(str) {
  return str.match(reUnicodeWord) || [];
}

// ── asciiWords (B4) ───────────────────────────────────────────────────────────
function asciiWords(str) {
  return str.match(reAsciiWord) || [];
}

// ── words (main export) ────────────────────────────────────────────────────────
function words(string, pattern, guard) {
  // B0: coerce to string
  string = toString(string);

  // B0a: guard normalization
  if (guard) {
    pattern = undefined;
  }

  // B1: no-pattern branch
  if (pattern === undefined) {
    return hasUnicodeWord(string) ? unicodeWords(string) : asciiWords(string);
  }

  // B2: pattern branch — delegate to native String.prototype.match
  return string.match(pattern) || [];
}

export default words;
