// @rederive/replace — verified-recompose of lodash.replace@4.1.4. quorum 3/3, differential 400/400, round 1. SIR: sir/replace.sir
function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

function isSymbol(value) {
  return typeof value === 'symbol'
    || (isObjectLike(value) && Object.prototype.toString.call(value) === '[object Symbol]');
}

function baseToString(value) {
  if (typeof value === 'string') return value;
  if (isSymbol(value)) return Symbol.prototype.toString.call(value);
  var result = (value + '');
  if (result === '0' && (1 / value) === -Infinity) return '-0';
  return result;
}

function toString(value) {
  if (value == null) return '';
  return baseToString(value);
}

function replace() {
  var string = toString(arguments[0]);
  if (arguments.length < 3) return string;
  return string.replace(arguments[1], arguments[2]);
}

export default replace;
