// @rederive/toRegexRange — verified-recompose of to-regex-range@5.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/toRegexRange.sir
// toRegexRange — clean-room re-emission from SIR (to-regex-range@5.0.1)
// Self-contained ES module; no imports.

// ---------------------------------------------------------------------------
// inlined is-number@7.0.0
// ---------------------------------------------------------------------------
function isNumber(num) {
  if (typeof num === 'number') {
    return (num - num === 0);
  }
  if (typeof num === 'string' && num.trim() !== '') {
    return Number.isFinite(+num);
  }
  return false;
}

// ---------------------------------------------------------------------------
// toCharacterClass(a, b, options) -> string
// ---------------------------------------------------------------------------
function toCharacterClass(a, b, options) {
  return '[' + a + ((b - a === 1) ? '' : '-') + b + ']';
}

// ---------------------------------------------------------------------------
// toQuantifier(digits) — digits is count ARRAY
// ---------------------------------------------------------------------------
function toQuantifier(digits) {
  const [start = 0, stop = ''] = digits;
  if (stop || start > 1) {
    return '{' + (start + (stop ? ',' + stop : '')) + '}';
  }
  return '';
}

// ---------------------------------------------------------------------------
// countNines(min, len) — replace last `len` digits of String(min) with 9s
// ---------------------------------------------------------------------------
function countNines(min, len) {
  return Number(String(min).slice(0, -len) + '9'.repeat(len));
}

// ---------------------------------------------------------------------------
// countZeros(integer, zeros) -> integer - (integer % 10^zeros)
// ---------------------------------------------------------------------------
function countZeros(integer, zeros) {
  return integer - (integer % Math.pow(10, zeros));
}

// ---------------------------------------------------------------------------
// splitToRanges(min, max) -> sorted Number[]
// ---------------------------------------------------------------------------
function compare(a, b) {
  return a > b ? 1 : (b > a ? -1 : 0);
}

function splitToRanges(min, max) {
  let nines = 1;
  let zeros = 1;
  let stop = countNines(min, nines);
  const stops = new Set([max]);

  while (min <= stop && stop <= max) {
    stops.add(stop);
    nines += 1;
    stop = countNines(min, nines);
  }

  stop = countZeros(max + 1, zeros) - 1;
  while (min < stop && stop <= max) {
    stops.add(stop);
    zeros += 1;
    stop = countZeros(max + 1, zeros) - 1;
  }

  const arr = [...stops];
  arr.sort(compare);
  return arr;
}

// ---------------------------------------------------------------------------
// rangeToPattern(start, stop, options) -> { pattern, count:[N], digits }
// ---------------------------------------------------------------------------
function zip(a, b) {
  const result = [];
  for (let i = 0; i < a.length; i++) {
    result.push([a[i], b[i]]);
  }
  return result;
}

function rangeToPattern(start, stop, options) {
  if (start === stop) {
    return { pattern: start, count: [], digits: 0 };
  }

  const zipped = zip(start, stop);
  const digits = zipped.length;
  let pattern = '';
  let count = 0;

  for (let i = 0; i < digits; i++) {
    const [sd, td] = zipped[i];
    if (sd === td) {
      pattern += sd;
    } else if (sd !== '0' || td !== '9') {
      pattern += toCharacterClass(sd, td, options);
    } else {
      count++;
    }
  }

  if (count) {
    pattern += (options.shorthand === true ? '\\d' : '[0-9]');
  }

  return { pattern, count: [count], digits };
}

// ---------------------------------------------------------------------------
// hasPadding(str) — /^-?(0+)\d/.test(String(str))
// ---------------------------------------------------------------------------
function hasPadding(str) {
  return /^-?(0+)\d/.test(String(str));
}

// ---------------------------------------------------------------------------
// padZeros(value, tok, options) -> string prefix
// ---------------------------------------------------------------------------
function padZeros(value, tok, options) {
  if (!tok.isPadded) {
    return value;
  }
  const diff = Math.abs(tok.maxLen - String(value).length);
  const relax = (options.relaxZeros !== false);
  switch (diff) {
    case 0: return '';
    case 1: return relax ? '0?' : '0';
    case 2: return relax ? '0{0,2}' : '00';
    default: return relax ? ('0{0,' + diff + '}') : ('0{' + diff + '}');
  }
}

// ---------------------------------------------------------------------------
// splitToPatterns(min, max, tok, options) -> token objects[]
// ---------------------------------------------------------------------------
function splitToPatterns(min, max, tok, options) {
  const ranges = splitToRanges(min, max);
  const tokens = [];
  let start = min;
  let prev;

  for (let i = 0; i < ranges.length; i++) {
    const rmax = ranges[i];
    const obj = rangeToPattern(String(start), String(rmax), options);
    let zeros = '';

    // Adjacent-pattern merge (disabled when padded)
    if (!tok.isPadded && prev && prev.pattern === obj.pattern) {
      if (prev.count.length > 1) {
        prev.count.pop();
      }
      prev.count.push(obj.count[0]);
      prev.string = prev.pattern + toQuantifier(prev.count);
      start = rmax + 1;
      continue;
    }

    if (tok.isPadded) {
      zeros = padZeros(rmax, tok, options);
    }

    obj.string = zeros + obj.pattern + toQuantifier(obj.count);
    tokens.push(obj);
    start = rmax + 1;
    prev = obj;
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// filterPatterns(arr, comparison, prefix, intersection, options) -> string[]
// ---------------------------------------------------------------------------
function contains(arr, key, val) {
  return arr.some(ele => ele[key] === val);
}

function filterPatterns(arr, comparison, prefix, intersection, options) {
  const result = [];
  for (const ele of arr) {
    const s = ele.string;
    if (!intersection && !contains(comparison, 'string', s)) {
      result.push(prefix + s);
    }
    if (intersection && contains(comparison, 'string', s)) {
      result.push(prefix + s);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// collatePatterns(neg, pos, options) -> string
// ---------------------------------------------------------------------------
function collatePatterns(neg, pos, options) {
  const onlyNegative = filterPatterns(neg, pos, '-', false, options) || [];
  const onlyPositive = filterPatterns(pos, neg, '', false, options) || [];
  const intersected  = filterPatterns(neg, pos, '-?', true, options) || [];
  const subpatterns  = onlyNegative.concat(intersected).concat(onlyPositive);
  return subpatterns.join('|');
}

// ---------------------------------------------------------------------------
// toRegexRange(min, max, options?) — main export
// ---------------------------------------------------------------------------
function toRegexRange(min, max, options) {
  // NODE 0: validate first arg
  if (isNumber(min) === false) {
    throw new TypeError('toRegexRange: expected the first argument to be a number');
  }

  // NODE 1: max omitted OR min strictly equals max
  if (max === void 0 || min === max) {
    return String(min);
  }

  // NODE 2: validate second arg
  if (isNumber(max) === false) {
    throw new TypeError('toRegexRange: expected the second argument to be a number.');
  }

  // NODE 3: resolve options
  const opts = { relaxZeros: true, ...options };
  if (typeof opts.strictZeros === 'boolean') {
    opts.relaxZeros = (opts.strictZeros === false);
  }

  // NODE 4: bounds ordering
  const a = Math.min(min, max);
  const b = Math.max(min, max);

  // NODE 5: adjacent special case (|abs diff| === 1)
  if (Math.abs(a - b) === 1) {
    const result = min + '|' + max;
    if (opts.capture) {
      return '(' + result + ')';
    }
    if (opts.wrap === false) {
      return result;
    }
    return '(?:' + result + ')';
  }

  // NODE 6: detect padding
  const isPadded = hasPadding(min) || hasPadding(max);
  const state = { min, max, a, b };
  let positives = [];
  let negatives = [];

  if (isPadded) {
    state.isPadded = isPadded;
    state.maxLen = String(state.max).length;
  }

  // NODE 7: split into negative and positive halves
  let aa = a;
  if (aa < 0) {
    const newMin = (b < 0) ? Math.abs(b) : 1;
    negatives = splitToPatterns(newMin, Math.abs(aa), state, opts);
    aa = state.a = 0;
  }
  if (b >= 0) {
    positives = splitToPatterns(aa, b, state, opts);
  }

  // NODE 8: collate, then wrap
  state.result = collatePatterns(negatives, positives, opts);

  if (opts.capture === true) {
    state.result = '(' + state.result + ')';
  } else if (opts.wrap !== false && (positives.length + negatives.length) > 1) {
    state.result = '(?:' + state.result + ')';
  }

  return state.result;
}

export default toRegexRange;
