// @rederive/toPath — verified-recompose of lodash.topath@4.5.2. quorum 2/3, differential 400/400, round 1. SIR: sir/toPath.sir
// emit_1.mjs — clean-room re-emission of lodash.topath toPath
// Reconstructed from toPath.sir (behavioral contract) alone.
// ES module; default export matches CommonJS `module.exports = toPath`.

// Node S5: the three regexes (verbatim from SIR)
const reLeadingDot = /^\./;
const rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
const reEscapeChar = /\\(\\)?/g;

// Node S1 helper: toKey — normalizes a single array element
function toKey(value) {
  // string: pass through unchanged (no parsing)
  if (typeof value === 'string') return value;
  // symbol: pass through by identity
  if (typeof value === 'symbol') return value;
  // everything else: coerce via (v + ''), with -0 guard
  const r = '' + value;
  if (r === '0' && (1 / value) === -Infinity) return '-0';
  return r;
}

// Node S3: toString — lodash _.toString coercion
function toString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  // -0 guard
  const r = '' + value;
  if (r === '0' && (1 / value) === -Infinity) return '-0';
  return r;
}

// Nodes S4+S5: stringToPath — parse a string into a path array
function stringToPath(s) {
  const result = [];

  // S4.1: s is already a string here (toString was applied before this call)
  // S4.2: leading-dot rule
  if (reLeadingDot.test(s)) {
    result.push('');
  }

  // S4.3: scan with the global regex
  // Reset lastIndex because the regex has the /g flag
  rePropName.lastIndex = 0;
  s.replace(rePropName, function(match, number, quote, qstr) {
    // APPEND RULE (node S5):
    //   if qstr is truthy (quoted form matched): unwrap escapes, push
    //   else push (number || match)
    const segment = qstr !== undefined
      ? qstr.replace(reEscapeChar, '$1')
      : (number !== undefined ? number : match);
    result.push(segment);
  });

  return result;
}

// Main export: toPath
export default function toPath(value) {
  // Node S0 DISPATCH

  // BRANCH A: true array
  if (Array.isArray(value)) {
    // Node S1: array-clone path — map each element through toKey, never parse
    const len = value.length;
    const result = new Array(len);
    for (let i = 0; i < len; i++) {
      result[i] = toKey(value[i]);
    }
    return result;
  }

  // BRANCH B: symbol (top-level or wrapped Symbol object)
  if (typeof value === 'symbol') {
    return [value];
  }
  // wrapped Symbol object: Object#toString tag is '[object Symbol]'
  if (value !== null && typeof value === 'object') {
    const tag = Object.prototype.toString.call(value);
    if (tag === '[object Symbol]') {
      return [value];
    }
  }

  // BRANCH C: everything else — scalar string-parse path
  // Node S2: toString then stringToPath
  const s = toString(value);
  return stringToPath(s);
}
