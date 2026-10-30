// @rederive/escapeRegExp — verified-recompose of lodash.escaperegexp@4.1.2. quorum 3/3, differential 495/400, round 3. SIR: sir/escapeRegExp.sir
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g,
    reHasRegExpChar = RegExp(reRegExpChar.source);

function isSymbol(value) {
  var type = typeof value;
  return type == 'symbol' ||
    (type === 'object' && value !== null && Object.prototype.toString.call(value) === '[object Symbol]');
}

function baseToString(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (isSymbol(value)) {
    return (typeof Symbol !== 'undefined' && Symbol.prototype) ? Symbol.prototype.toString.call(value) : '';
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -Infinity) ? '-0' : result;
}

function toString(value) {
  return (value == null) ? '' : baseToString(value);
}

function escapeRegExp(string) {
  var s = toString(string);
  return (s && reHasRegExpChar.test(s))
    ? s.replace(reRegExpChar, '\\$&')
    : s;
}

export default escapeRegExp;
