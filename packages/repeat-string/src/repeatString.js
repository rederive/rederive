// @rederive/repeatString — verified-recompose of repeat-string@1.6.1. quorum 3/3, differential 400/400, round 1. SIR: sir/repeatString.sir
// Clean-room re-emission of repeat-string@1.6.1 — emitter #1 of 3
// Reconstructed from SIR + frozen oracle ONLY. No original source consulted.
// License: MIT (upstream: Jon Schlinkert)

// Module-level memo state (persists across calls), exactly as documented in the SIR.
let res = '';
let cache = undefined;

function repeat(str, num) {
  // NODE 1 — guard: first arg must be a primitive string (typeof check)
  if (typeof str !== 'string') {
    throw new TypeError('expected a string');
  }

  // NODE 2 — fast path: num === 1 (strict equality, bypasses cache)
  if (num === 1) return str;

  // NODE 3 — fast path: num === 2 (strict equality, bypasses cache)
  if (num === 2) return str + str;

  // NODE 4 — generic path
  // max uses JS arithmetic coercion on num
  let max = str.length * num;

  // Cache management
  if (cache !== str || typeof cache === 'undefined') {
    cache = str;
    res = '';
  } else if (res.length >= max) {
    // Cache hit: return prefix of prior accumulated res
    return res.substr(0, max);
  }

  // Doubling accumulation loop
  // num & 1 and num >>= 1 use ToInt32 coercion (truncates fractions, Infinity -> 0)
  while (max > res.length && num > 1) {
    if (num & 1) res += str;  // odd bit: append current str
    num >>= 1;                 // halve (ToInt32 right-shift)
    str += str;                // double the working string
  }
  res += str;                  // append final doubled chunk
  res = res.substr(0, max);    // truncate to exactly max chars (NaN/<=0 -> '')
  return res;
}

export default repeat;
