// @rederive/escape — verified-recompose of lodash.escape@4.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/escape.sir
const reUnescapedHtml = /[&<>"'`]/g;
const reHasUnescapedHtml = /[&<>"'`]/;

const htmlEscapes = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;'
};

const INFINITY = 1 / 0;

function escapeHtmlChar(chr) {
  return htmlEscapes[chr];
}

function isSymbol(value) {
  const type = typeof value;
  return type === 'symbol' || (type === 'object' && value != null && Object.prototype.toString.call(value) === '[object Symbol]');
}

function baseToString(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (isSymbol(value)) {
    return Symbol.prototype.toString.call(value);
  }
  const result = (value + '');
  if (result === '0' && (1 / value) === -INFINITY) {
    return '-0';
  }
  return result;
}

function toString(value) {
  if (value == null) {
    return '';
  }
  return baseToString(value);
}

function escape(string) {
  string = toString(string);
  return (string && reHasUnescapedHtml.test(string))
    ? string.replace(reUnescapedHtml, escapeHtmlChar)
    : string;
}

export default escape;
