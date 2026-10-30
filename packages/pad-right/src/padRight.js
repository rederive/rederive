// @rederive/padRight — verified-recompose of pad-right@0.2.2. quorum 2/3, differential 400/400, round 1. SIR: sir/padRight.sir
export default function padRight(val, num, str) {
  var padding = '';
  var diff = num - val.length;
  if (diff <= 5 && !str) {
    padding = '00000';
  } else if (diff <= 25 && !str) {
    padding = '000000000000000000000000000';
  } else {
    return val + repeat(str || '0', diff);
  }
  return val + padding.slice(0, diff);
}

function repeat(str, num) {
  if (typeof str !== 'string') {
    throw new TypeError('expected a string');
  }
  if (num <= 0 || num !== num) {
    return '';
  }
  if (num === 1) {
    return str;
  }
  if (num === 2) {
    return str + str;
  }
  var result = '';
  var pattern = str;
  while (num > 0) {
    if (num & 1) {
      result += pattern;
    }
    num >>= 1;
    if (num > 0) {
      pattern += pattern;
    }
  }
  return result;
}
