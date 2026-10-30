// @rederive/ms — verified-recompose of ms@2.1.2. quorum 3/3, differential 400/400, round 1. SIR: sir/ms.sir
// Clean-room re-emission of ms@2.1.2 — reconstructed from SIR contract + frozen oracle.
// export default function ms(val, options) { ... }

const s = 1000;
const m = s * 60;        // 60000
const h = m * 60;        // 3600000
const d = h * 24;        // 86400000
const w = d * 7;         // 604800000
const y = d * 365.25;    // 31557600000

// Anchored case-insensitive regex (exactly as specified in SIR node 3c):
const REGEX = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i;

function parse(str) {
  str = String(str);
  if (str.length > 100) {
    return undefined;
  }
  const match = REGEX.exec(str);
  if (!match) {
    return undefined;
  }
  const n = parseFloat(match[1]);
  const type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'weeks':
    case 'week':
    case 'w':
      return n * w;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      return undefined;
  }
}

function fmtShort(ms) {
  const msAbs = Math.abs(ms);
  if (msAbs >= d) {
    return Math.round(ms / d) + 'd';
  }
  if (msAbs >= h) {
    return Math.round(ms / h) + 'h';
  }
  if (msAbs >= m) {
    return Math.round(ms / m) + 'm';
  }
  if (msAbs >= s) {
    return Math.round(ms / s) + 's';
  }
  return ms + 'ms';
}

function plural(ms, msAbs, n, name) {
  const isPlural = msAbs >= n * 1.5;
  return Math.round(ms / n) + ' ' + name + (isPlural ? 's' : '');
}

function fmtLong(ms) {
  const msAbs = Math.abs(ms);
  if (msAbs >= d) {
    return plural(ms, msAbs, d, 'day');
  }
  if (msAbs >= h) {
    return plural(ms, msAbs, h, 'hour');
  }
  if (msAbs >= m) {
    return plural(ms, msAbs, m, 'minute');
  }
  if (msAbs >= s) {
    return plural(ms, msAbs, s, 'second');
  }
  return ms + ' ms';
}

export default function ms(val, options) {
  options = options || {};
  const type = typeof val;
  if (type === 'string' && val.length > 0) {
    return parse(val);
  }
  if (type === 'number' && isFinite(val)) {
    return options.long ? fmtLong(val) : fmtShort(val);
  }
  throw new Error(
    'val is not a non-empty string or a valid number. val=' + JSON.stringify(val)
  );
}
