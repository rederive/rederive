// @rederive/padLeft — verified-recompose of pad-left@2.1.0. quorum 3/3, differential 400/400, round 1. SIR: sir/padLeft.sir
export default function padLeft(str, num, ch) {
  str = str.toString();
  if (typeof num === 'undefined') return str;
  if (ch === 0) {
    ch = '0';
  } else if (ch) {
    ch = ch.toString();
  } else {
    ch = ' ';
  }
  var count = num - str.length;
  var pad = '';
  if (count > 0 && Number.isInteger(count)) {
    for (var i = 0; i < count; i++) pad += ch;
  }
  return pad + str;
}
