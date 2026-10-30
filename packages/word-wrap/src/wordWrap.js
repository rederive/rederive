// @rederive/wordWrap — verified-recompose of word-wrap@1.2.5. quorum 3/3, differential 400/400, round 1. SIR: sir/wordWrap.sir
// Clean-room re-emission of word-wrap@1.2.5 default export.
// Reconstructed from SIR contract + frozen oracle only.

function identity(s) {
  return s;
}

function trimEnd(str) {
  var lastCharPos = str.length - 1;
  var lastChar = str[lastCharPos];
  while (lastChar === ' ' || lastChar === '\t') {
    lastChar = str[--lastCharPos];
  }
  return str.substring(0, lastCharPos + 1);
}

function trimTabAndSpaces(str) {
  return str.split('\n').map(trimEnd).join('\n');
}

function wordWrap(str, options) {
  // NODE 1 — option defaulting
  options = options || {};

  // NODE 2 — null/undefined short-circuit (loose equality)
  if (str == null) return str;

  // NODE 3 — resolve width
  var width = options.width || 50;

  // NODE 4 — resolve indent
  var indent = (typeof options.indent === 'string') ? options.indent : '  ';

  // NODE 5 — resolve newline
  var newline = options.newline || ('\n' + indent);

  // NODE 6 — resolve escape
  var escape = (typeof options.escape === 'function') ? options.escape : identity;

  // NODE 7 — build chunking regex
  // The character classes include \s AND U+200B (zero-width space) explicitly.
  var regexString = '.{1,' + width + '}';
  if (options.cut !== true) {
    regexString += '([\\s​]+|$)|[^\\s​]+?([\\s​]+|$)';
  }
  var re = new RegExp(regexString, 'g');

  // NODE 8 — chunk
  var lines = str.match(re) || [];

  // NODE 9 — per-chunk transform + join
  var result = indent + lines.map(function(line) {
    if (line.slice(-1) === '\n') {
      line = line.slice(0, line.length - 1);
    }
    return escape(line);
  }).join(newline);

  // NODE 10 — optional trim
  if (options.trim === true) {
    result = trimTabAndSpaces(result);
  }

  return result;
}

export default wordWrap;
