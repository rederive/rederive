// @rederive/v4 — verified-recompose of uuid@3.3.3. quorum 3/3, differential 400/400, round 1. SIR: sir/v4.sir
// uuid v4 — reconstructed from SIR + frozen oracle
// Zero dependencies. ES module.

var byteToHex = [];
for (var _i = 0; _i < 256; ++_i) {
  byteToHex[_i] = (_i + 0x100).toString(16).substr(1);
}

function bytesToUuid(buf, offset) {
  var i = offset || 0;
  var bth = byteToHex;
  return (
    bth[buf[i++]] +
    bth[buf[i++]] +
    bth[buf[i++]] +
    bth[buf[i++]] +
    '-' +
    bth[buf[i++]] +
    bth[buf[i++]] +
    '-' +
    bth[buf[i++]] +
    bth[buf[i++]] +
    '-' +
    bth[buf[i++]] +
    bth[buf[i++]] +
    '-' +
    bth[buf[i++]] +
    bth[buf[i++]] +
    bth[buf[i++]] +
    bth[buf[i++]] +
    bth[buf[i++]] +
    bth[buf[i++]]
  );
}

// Default rng stub — live wrapper would supply real randomness;
// oracle always provides options.random so this is never reached in tests.
function rng() {
  throw new Error('rng: no randomness source supplied');
}

export function v4(options, buf, offset) {
  // Step 1: offset index
  var i = (buf && offset) || 0;

  // Step 2: string-options quirk
  if (typeof options === 'string') {
    buf = (options === 'binary') ? new Array(16) : null;
    options = null;
  }

  // Step 3
  options = options || {};

  // Step 4: resolve bytes
  var rnds = options.random || (options.rng || rng)();

  // Step 5: version bits
  rnds[6] = (rnds[6] & 0x0f) | 0x40;

  // Step 6: variant bits
  rnds[8] = (rnds[8] & 0x3f) | 0x80;

  // Step 7 + 8: buf write + return
  if (buf) {
    for (var ii = 0; ii < 16; ++ii) {
      buf[i + ii] = rnds[ii];
    }
    return buf;
  }

  return bytesToUuid(rnds);
}

export default v4;
