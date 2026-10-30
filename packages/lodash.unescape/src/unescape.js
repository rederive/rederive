// @rederive/unescape — verified-recompose of lodash.unescape@4.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/unescape.sir
const htmlUnescapes = {
  '&amp;':  '&',
  '&lt;':   '<',
  '&gt;':   '>',
  '&quot;': '"',
  '&#39;':  "'",
  '&#96;':  '`',
};

const reEscapedHtml    = /&(?:amp|lt|gt|quot|#39|#96);/g;
const reHasEscapedHtml = /&(?:amp|lt|gt|quot|#39|#96);/;

function isSymbol(value) {
  const type = typeof value;
  return type === 'symbol' ||
    (type === 'object' && value !== null &&
      Object.prototype.toString.call(value) === '[object Symbol]');
}

function baseToString(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (isSymbol(value)) {
    return Symbol.prototype.toString.call(value);
  }
  const result = (value + '');
  if (result === '0' && (1 / value) === -Infinity) {
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

function unescape(string) {
  string = toString(string);
  if (string && reHasEscapedHtml.test(string)) {
    return string.replace(reEscapedHtml, chr => htmlUnescapes[chr]);
  }
  return string;
}

export default unescape;
