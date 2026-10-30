// @rederive/fillRange — verified-recompose of fill-range@7.1.1. quorum 3/3, differential 400/400, round 1. SIR: sir/fillRange.sir
// Self-contained ES module — fill-range@7.1.1 clean-room re-emission.
// No imports. to-regex-range@5.0.1 + is-number@7.0.0 inlined as helpers.

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function isObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function isValidValue(value) {
  return typeof value === 'number' || (typeof value === 'string' && value !== '');
}

// fill-range's OWN integer test (N3c / N3d dispatch)
function isNumberLOCAL(num) {
  return Number.isInteger(+num);
}

// is-number@7.0.0 — used ONLY inside toRegexRange
function isNumberPKG(num) {
  if (typeof num === 'number') return num - num === 0;
  if (typeof num === 'string' && num.trim() !== '') return Number.isFinite(+num);
  return false;
}

// Leading-zero / padding detector
function zeros(input) {
  let value = `${input}`;
  let index = -1;
  if (value[0] === '-') value = value.slice(1);
  if (value === '0') return false;
  while (value[++index] === '0');
  return index > 0;
}

function stringify(start, end, options) {
  if (typeof start === 'string' || typeof end === 'string') return true;
  return options.stringify === true;
}

// Left-pad a single formatted value with '0' to maxLength
function pad(input, maxLength, toNumber) {
  if (maxLength > 0) {
    let dash = input[0] === '-' ? '-' : '';
    if (dash) input = input.slice(1);
    input = dash + String(input).padStart(dash ? maxLength - 1 : maxLength, '0');
  }
  if (toNumber === false) return String(input);
  return input;
}

// Left-pad a STRING to maxLength accounting for a leading '-'
function toMaxLen(input, maxLength) {
  let negative = input[0] === '-' ? '-' : '';
  if (negative) { input = input.slice(1); maxLength--; }
  while (input.length < maxLength) input = '0' + input;
  return negative ? ('-' + input) : input;
}

// Default value formatter factory
function transform(toNumber) {
  return function(value) {
    return toNumber === true ? Number(value) : String(value);
  };
}

// util.inspect-style formatting for error messages
function inspectArgs(start, end) {
  function fmt(v) {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'string') return `'${v}'`;
    return String(v);
  }
  return `[ ${fmt(start)}, ${fmt(end)} ]`;
}

function invalidRange(start, end, options) {
  if (options.strictRanges === true) {
    throw new RangeError('Invalid range arguments: ' + inspectArgs(start, end));
  }
  return [];
}

function invalidStep(step, opts) {
  if (opts.strictRanges === true) {
    throw new TypeError(`Expected step "${step}" to be a number`);
  }
  return [];
}

// ---------------------------------------------------------------------------
// N6: INLINED to-regex-range@5.0.1
// ---------------------------------------------------------------------------

function hasPadding(str) {
  return /^-?(0+)\d/.test(str);
}

function compare(a, b) {
  return a > b ? 1 : b > a ? -1 : 0;
}

function countNines(min, len) {
  return Number(String(min).slice(0, -len) + '9'.repeat(len));
}

function countZeros(integer, zeros) {
  return integer - (integer % Math.pow(10, zeros));
}

function splitToRanges(min, max) {
  let nines = 1, z = 1;
  let stop = countNines(min, nines);
  let stops = new Set([max]);
  while (min <= stop && stop <= max) {
    stops.add(stop);
    nines += 1;
    stop = countNines(min, nines);
  }
  stop = countZeros(max + 1, z) - 1;
  while (min < stop && stop <= max) {
    stops.add(stop);
    z += 1;
    stop = countZeros(max + 1, z) - 1;
  }
  stops = [...stops];
  stops.sort(compare);
  return stops;
}

function zip(a, b) {
  let arr = [];
  for (let i = 0; i < a.length; i++) arr.push([a[i], b[i]]);
  return arr;
}

function toCharacterClass(a, b, options) {
  return `[${a}${(b - a === 1) ? '' : '-'}${b}]`;
}

function toQuantifier(digits) {
  let [start = 0, stop = ''] = digits;
  if (stop || start > 1) return `{${start + (stop ? ',' + stop : '')}}`;
  return '';
}

function padZeros(value, tok, options) {
  if (!tok.isPadded) return value;
  let diff = Math.abs(tok.maxLen - String(value).length);
  let relax = options.relaxZeros !== false;
  switch (diff) {
    case 0: return '';
    case 1: return relax ? '0?' : '0';
    case 2: return relax ? '0{0,2}' : '00';
    default: return relax ? `0{0,${diff}}` : `0{${diff}}`;
  }
}

function rangeToPattern(start, stop, options) {
  if (start === stop) return { pattern: start, count: [], digits: 0 };
  let zipped = zip(start, stop);
  let digits = zipped.length;
  let pattern = '';
  let count = 0;
  for (let i = 0; i < digits; i++) {
    let [startDigit, stopDigit] = zipped[i];
    if (startDigit === stopDigit) {
      pattern += startDigit;
    } else if (startDigit !== '0' || stopDigit !== '9') {
      pattern += toCharacterClass(startDigit, stopDigit, options);
    } else {
      count++;
    }
  }
  if (count) pattern += (options.shorthand === true ? '\\d' : '[0-9]');
  return { pattern, count: [count], digits };
}

function splitToPatterns(min, max, tok, options) {
  let ranges = splitToRanges(min, max);
  let tokens = [];
  let start = min;
  let prev;
  for (let i = 0; i < ranges.length; i++) {
    let maxVal = ranges[i];
    let obj = rangeToPattern(String(start), String(maxVal), options);
    let zeros = '';
    if (!tok.isPadded && prev && prev.pattern === obj.pattern) {
      if (prev.count.length > 1) prev.count.pop();
      prev.count.push(obj.count[0]);
      prev.string = prev.pattern + toQuantifier(prev.count);
      start = maxVal + 1;
      continue;
    }
    if (tok.isPadded) zeros = padZeros(maxVal, tok, options);
    obj.string = zeros + obj.pattern + toQuantifier(obj.count);
    tokens.push(obj);
    start = maxVal + 1;
    prev = obj;
  }
  return tokens;
}

function contains(arr, key, val) {
  return arr.some(ele => ele[key] === val);
}

function filterPatterns(arr, comparison, prefix, intersection, options) {
  let result = [];
  for (let ele of arr) {
    let { string } = ele;
    if (!intersection && !contains(comparison, 'string', string)) result.push(prefix + string);
    if (intersection && contains(comparison, 'string', string)) result.push(prefix + string);
  }
  return result;
}

function collatePatterns(neg, pos, options) {
  let onlyNegative = filterPatterns(neg, pos, '-', false, options) || [];
  let onlyPositive = filterPatterns(pos, neg, '', false, options) || [];
  let intersected = filterPatterns(neg, pos, '-?', true, options) || [];
  return onlyNegative.concat(intersected).concat(onlyPositive).join('|');
}

function toRegexRange(min, max, options) {
  if (isNumberPKG(min) === false) {
    throw new TypeError('toRegexRange: expected the first argument to be a number');
  }
  if (max === void 0 || min === max) return String(min);
  if (isNumberPKG(max) === false) {
    throw new TypeError('toRegexRange: expected the second argument to be a number.');
  }
  let opts = { relaxZeros: true, ...options };
  if (typeof opts.strictZeros === 'boolean') opts.relaxZeros = (opts.strictZeros === false);

  let a = Math.min(min, max);
  let b = Math.max(min, max);

  if (Math.abs(a - b) === 1) {
    let result = min + '|' + max;
    if (opts.capture) return `(${result})`;
    if (opts.wrap === false) return result;
    return `(?:${result})`;
  }

  let isPadded = hasPadding(min) || hasPadding(max);
  let state = { min, max, a, b };
  let positives = [], negatives = [];

  if (isPadded) {
    state.isPadded = isPadded;
    state.maxLen = String(state.max).length;
  }

  if (a < 0) {
    let newMin = b < 0 ? Math.abs(b) : 1;
    negatives = splitToPatterns(newMin, Math.abs(a), state, opts);
    a = state.a = 0;
  }

  if (b >= 0) positives = splitToPatterns(a, b, state, opts);

  state.negatives = negatives;
  state.positives = positives;
  state.result = collatePatterns(negatives, positives, opts);

  if (opts.capture === true) {
    state.result = `(${state.result})`;
  } else if (opts.wrap !== false && (positives.length + negatives.length) > 1) {
    state.result = `(?:${state.result})`;
  }

  return state.result;
}

// fill-range's local toRange helper
function toRange(a, b, isNumbers, options) {
  if (isNumbers) return toRegexRange(a, b, { wrap: false, ...options });
  let start = String.fromCharCode(a);
  if (a === b) return start;
  let stop = String.fromCharCode(b);
  return `[${start}-${stop}]`;
}

// fill-range's local toSequence helper (numeric step>1 toRegex)
function toSequence(parts, options, maxLen) {
  parts.negatives.sort((x, y) => x < y ? -1 : x > y ? 1 : 0);
  parts.positives.sort((x, y) => x < y ? -1 : x > y ? 1 : 0);
  let prefix = options.capture ? '' : '?:';
  let positives = parts.positives.length
    ? parts.positives.map(v => toMaxLen(String(v), maxLen)).join('|')
    : '';
  let negatives = parts.negatives.length
    ? `-(${prefix}${parts.negatives.map(v => toMaxLen(String(v), maxLen)).join('|')})`
    : '';
  let result = (positives && negatives)
    ? `${positives}|${negatives}`
    : (positives || negatives);
  if (options.wrap) return `(${prefix}${result})`;
  return result;
}

// fill-range's local toRegex helper
function toRegexHelper(start, end, options) {
  if (Array.isArray(start)) {
    let wrap = options.wrap === true;
    let prefix = options.capture ? '' : '?:';
    return wrap ? `(${prefix}${start.join('|')})` : start.join('|');
  }
  return toRegexRange(start, end, options);
}

// ---------------------------------------------------------------------------
// N4: fillNumbers
// ---------------------------------------------------------------------------

function fillNumbers(start, end, step, options) {
  let a = Number(start);
  let b = Number(end);

  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    if (options.strictRanges === true) {
      throw new RangeError('Invalid range arguments: ' + inspectArgs(start, end));
    }
    return [];
  }

  if (a === 0) a = 0;
  if (b === 0) b = 0;

  let descending = a > b;
  let startString = String(start);
  let endString = String(end);
  let stepString = String(step);

  step = Math.max(Math.abs(step), 1);

  let padded = zeros(startString) || zeros(endString) || zeros(stepString);
  let maxLen = padded
    ? Math.max(startString.length, endString.length, stepString.length)
    : 0;
  let toNumber = (padded === false) && (stringify(start, end, options) === false);
  let format = options.transform || transform(toNumber);

  // N4a: numeric toRegex fast path (step === 1)
  if (options.toRegex && step === 1) {
    return toRange(toMaxLen(start, maxLen), toMaxLen(end, maxLen), true, options);
  }

  // N4b: build value list
  let parts = { negatives: [], positives: [] };
  let push = num => parts[num < 0 ? 'negatives' : 'positives'].push(Math.abs(num));
  let range = [];
  let index = 0;
  let cur = a;

  while (descending ? cur >= b : cur <= b) {
    if (options.toRegex === true && step > 1) {
      push(cur);
    } else {
      range.push(pad(format(cur, index), maxLen, toNumber));
    }
    cur = descending ? cur - step : cur + step;
    index++;
  }

  // N4c: toRegex assembly
  if (options.toRegex === true) {
    return step > 1
      ? toSequence(parts, options, maxLen)
      : toRegexHelper(range, null, { wrap: false, ...options });
  }

  return range;
}

// ---------------------------------------------------------------------------
// N5: fillLetters
// ---------------------------------------------------------------------------

function fillLetters(start, end, step, options) {
  if ((!isNumberLOCAL(start) && start.length > 1) || (!isNumberLOCAL(end) && end.length > 1)) {
    return invalidRange(start, end, options);
  }

  let format = options.transform || (val => String.fromCharCode(val));
  let a = `${start}`.charCodeAt(0);
  let b = `${end}`.charCodeAt(0);
  let descending = a > b;
  let min = Math.min(a, b);
  let max = Math.max(a, b);

  // N5a: letters toRegex fast path (step === 1)
  if (options.toRegex && step === 1) {
    return toRange(min, max, false, options);
  }

  // N5b: build char list
  let range = [];
  let index = 0;
  let cur = a;

  while (descending ? cur >= b : cur <= b) {
    range.push(format(cur, index));
    cur = descending ? cur - step : cur + step;
    index++;
  }

  // N5c: letters toRegex assembly (step > 1)
  // BUG REPRODUCED EXACTLY: { wrap: false, options } — options is a NESTED KEY, NOT spread
  if (options.toRegex === true) {
    return toRegexHelper(range, null, { wrap: false, options });
  }

  return range;
}

// ---------------------------------------------------------------------------
// DEFAULT EXPORT
// ---------------------------------------------------------------------------

export default function fillRange(start, end, step, options = {}) {
  // N0: single-value short-circuit
  if (end == null && isValidValue(start)) return [start];

  // N1: invalid-range guard
  if (!isValidValue(start) || !isValidValue(end)) return invalidRange(start, end, options);

  // N2: function step -> transform redirect (out of envelope, preserved for completeness)
  if (typeof step === 'function') return fillRange(start, end, 1, { transform: step });

  // N3: object step -> options redirect
  if (isObject(step)) return fillRange(start, end, 0, step);

  // N3b: normalize options + step
  let opts = { ...options };
  if (opts.capture === true) opts.wrap = true;
  step = step || opts.step || 1;

  // N3c: step validity
  if (!isNumberLOCAL(step)) {
    if (step != null && !isObject(step)) return invalidStep(step, opts);
    return fillRange(start, end, 1, step);
  }

  // N3d: numeric-vs-letter dispatch
  if (isNumberLOCAL(start) && isNumberLOCAL(end)) {
    return fillNumbers(start, end, step, opts);
  }
  return fillLetters(start, end, Math.max(Math.abs(step), 1), opts);
}
