// @rederive/leftPad — verified-recompose of left-pad@1.3.0. quorum 3/3, differential 400/400, round 1. SIR: sir/leftPad.sir
// Clean-room re-emission of left-pad@1.3.0 (leftPad) from SIR contract.
// Default export, zero dependencies.

const cache = [
  '',
  ' ',
  '  ',
  '   ',
  '    ',
  '     ',
  '      ',
  '       ',
  '        ',
  '         ',
];

function leftPad(str, len, ch) {
  // NODE 1: coerce str to string via "+ ''"
  str = str + '';

  // NODE 2: compute gap = len - str.length (JS numeric coercion of len)
  len = len - str.length;

  // NODE 3: no padding needed
  if (len <= 0) return str;

  // NODE 4: default ch to space, with strict-zero exception
  // (!ch && ch !== 0): falsy ch but NOT the number 0 -> use space
  if (!ch && ch !== 0) ch = ' ';

  // NODE 5: coerce ch to string via "+ ''"
  ch = ch + '';

  // NODE 6: cache fast-path (ch is exactly a single space AND gap < 10)
  if (ch === ' ' && len < 10) return cache[len] + str;

  // NODE 7: doubling/repeat loop
  // len and ch are already set; bitwise ops apply ToInt32 to len each time
  var pad = '';
  while (true) {
    if (len & 1) pad += ch;
    len >>= 1;
    if (len) ch += ch;
    else break;
  }
  return pad + str;
}

export default leftPad;
