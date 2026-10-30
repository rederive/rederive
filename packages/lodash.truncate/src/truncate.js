// @rederive/truncate — verified-recompose of lodash.truncate@4.4.2. quorum 3/3, differential 400/400, round 1. SIR: sir/truncate.sir
// Clean-room re-emission of lodash.truncate@4.4.2
// Reconstructed from SIR + frozen oracle only.

const DEFAULT_TRUNC_LENGTH = 30;
const DEFAULT_TRUNC_OMISSION = '...';
const INFINITY = 1 / 0;
const MAX_INTEGER = 1.7976931348623157e+308;
const NAN = 0 / 0;

const regexpTag = '[object RegExp]';
const symbolTag = '[object Symbol]';

const reTrim = /^\s+|\s+$/g;
const reFlags = /\w*$/;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;

// Unicode regex composition
const rsAstralRange       = '\\ud800-\\udfff';
const rsComboMarksRange   = '\\u0300-\\u036f\\ufe20-\\ufe23';
const rsComboSymbolsRange = '\\u20d0-\\u20f0';
const rsVarRange          = '\\ufe0e\\ufe0f';
const rsAstral    = '[' + rsAstralRange + ']';
const rsCombo     = '[' + rsComboMarksRange + rsComboSymbolsRange + ']';
const rsFitz      = '\\ud83c[\\udffb-\\udfff]';
const rsModifier  = '(?:' + rsCombo + '|' + rsFitz + ')';
const rsNonAstral = '[^' + rsAstralRange + ']';
const rsRegional  = '(?:\\ud83c[\\udde6-\\uddff]){2}';
const rsSurrPair  = '[\\ud800-\\udbff][\\udc00-\\udfff]';
const rsZWJ       = '\\u200d';
const reOptMod    = rsModifier + '?';
const rsOptVar    = '[' + rsVarRange + ']?';
const rsOptJoin   = '(?:' + rsZWJ + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsOptVar + reOptMod + ')*';
const rsSeq       = rsOptVar + reOptMod + rsOptJoin;
const rsSymbol    = '(?:' + [rsNonAstral + rsCombo + '?', rsCombo, rsRegional, rsSurrPair, rsAstral].join('|') + ')';
const reUnicode    = RegExp(rsFitz + '(?=' + rsFitz + ')|' + rsSymbol + rsSeq, 'g');
const reHasUnicode = RegExp('[' + rsZWJ + rsAstralRange + rsComboMarksRange + rsComboSymbolsRange + rsVarRange + ']');

// =====================================================================
// Coercion helpers
// =====================================================================

function isObject(v) {
  const type = typeof v;
  return !!v && (type === 'object' || type === 'function');
}

function isObjectLike(v) {
  return !!v && typeof v === 'object';
}

function isSymbol(v) {
  return typeof v === 'symbol' ||
    (isObjectLike(v) && Object.prototype.toString.call(v) === symbolTag);
}

function isRegExp(v) {
  return isObject(v) && Object.prototype.toString.call(v) === regexpTag;
}

function baseToString(v) {
  if (typeof v === 'string') {
    return v;
  }
  if (isSymbol(v)) {
    return Symbol.prototype.toString ? Symbol.prototype.toString.call(v) : '';
  }
  const result = (v + '');
  return (result === '0' && (1 / v) === -INFINITY) ? '-0' : result;
}

function toString(v) {
  return v == null ? '' : baseToString(v);
}

function toNumber(v) {
  if (typeof v === 'number') {
    return v;
  }
  if (isSymbol(v)) {
    return NAN;
  }
  if (isObject(v)) {
    const other = (typeof v.valueOf === 'function' ? v.valueOf() : v);
    v = isObject(other) ? (other + '') : other;
  }
  if (typeof v !== 'string') {
    return v === 0 ? v : +v;
  }
  v = v.replace(reTrim, '');
  const isBinary = reIsBinary.test(v);
  return (isBinary || reIsOctal.test(v))
    ? parseInt(v.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex.test(v) ? NAN : +v);
}

function toFinite(v) {
  if (!v) {
    return v === 0 ? v : 0;
  }
  v = toNumber(v);
  if (v === INFINITY || v === -INFINITY) {
    return (v < 0 ? -1 : 1) * MAX_INTEGER;
  }
  return v === v ? v : 0;
}

function toInteger(v) {
  const result = toFinite(v);
  const remainder = result % 1;
  return result === result ? (remainder ? result - remainder : result) : 0;
}

// =====================================================================
// Unicode size / array helpers
// =====================================================================

function hasUnicode(s) {
  return reHasUnicode.test(s);
}

function asciiSize(s) {
  return s == null ? undefined : s.length;
}

function asciiToArray(s) {
  return s.split('');
}

function unicodeSize(s) {
  reUnicode.lastIndex = 0;
  let result = 0;
  while (reUnicode.test(s)) {
    result++;
  }
  return result;
}

function unicodeToArray(s) {
  return s.match(reUnicode) || [];
}

function stringSize(s) {
  return hasUnicode(s) ? unicodeSize(s) : asciiSize(s);
}

function stringToArray(s) {
  return hasUnicode(s) ? unicodeToArray(s) : asciiToArray(s);
}

// =====================================================================
// Array slice helpers
// =====================================================================

function baseSlice(array, start, end) {
  let length = array.length;
  if (start < 0) {
    start = (-start > length) ? 0 : (length + start);
  }
  end = end > length ? length : end;
  if (end < 0) {
    end += length;
  }
  length = start > end ? 0 : ((end - start) >>> 0);
  start >>>= 0;
  const result = new Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = array[i + start];
  }
  return result;
}

function castSlice(array, start, end) {
  const length = array.length;
  end = end === undefined ? length : end;
  return (!start && end >= length) ? array : baseSlice(array, start, end);
}

// =====================================================================
// truncate — the main function
// =====================================================================

function truncate(string, options) {
  // N1. Resolve options
  let length   = DEFAULT_TRUNC_LENGTH;
  let omission = DEFAULT_TRUNC_OMISSION;
  let separator = undefined;

  if (isObject(options)) {
    separator = ('separator' in options) ? options.separator : undefined;
    length    = ('length' in options)   ? toInteger(options.length)       : DEFAULT_TRUNC_LENGTH;
    omission  = ('omission' in options) ? baseToString(options.omission)  : DEFAULT_TRUNC_OMISSION;
  }

  // N2. Coerce the subject string
  string = toString(string);

  // N3. Measure length in SYMBOLS if unicode, else code units
  let strLength  = string.length;
  let strSymbols = undefined;
  if (hasUnicode(string)) {
    strSymbols = stringToArray(string);
    strLength  = strSymbols.length;
  }

  // N4. Early return: already within the limit
  if (length >= strLength) {
    return string;
  }

  // N5. Compute the content end position (in SYMBOL units when unicode)
  let end = length - stringSize(omission);
  if (end < 1) {
    return omission;
  }

  // N6. Take the leading slice
  let result;
  if (strSymbols) {
    result = castSlice(strSymbols, 0, end).join('');
  } else {
    result = string.slice(0, end);
  }

  // N7. No separator -> done
  if (separator === undefined) {
    return result + omission;
  }

  // N8. Re-base `end` to CODE units on the unicode path
  if (strSymbols) {
    end += (result.length - end);
  }

  // N9a. RegExp separator
  if (isRegExp(separator)) {
    if (string.slice(end).search(separator)) {
      let match = undefined;
      const substring = result;
      let newEnd = undefined;
      if (!separator.global) {
        separator = RegExp(separator.source, toString(reFlags.exec(separator)) + 'g');
      }
      separator.lastIndex = 0;
      while ((match = separator.exec(substring))) {
        newEnd = match.index;
      }
      result = result.slice(0, newEnd === undefined ? end : newEnd);
    }
    // ELSE (search returned 0 -> falsy): block skipped, result kept as-is.
  }
  // N9b. String separator (and any non-RegExp separator)
  else if (string.indexOf(baseToString(separator), end) !== end) {
    const index = result.lastIndexOf(separator);
    if (index > -1) {
      result = result.slice(0, index);
    }
  }

  // N10. Append omission
  return result + omission;
}

export default truncate;
