// @rederive/isGlob — verified-recompose of is-glob@4.0.3. quorum 3/3, differential 400/400, round 1. SIR: sir/isGlob.sir
// Clean-room re-emission of isGlob (is-glob@4.0.3) from SIR contract.
// is-extglob@2.1.1 inlined. No external dependencies.

const chars = { '{': '}', '(': ')', '[': ']' };

function isExtglob(str) {
  if (typeof str !== 'string' || str === '') return false;
  var match;
  while ((match = /(\\).|([@?!+*]\(.*\))/g.exec(str))) {
    if (match[2]) return true;
    str = str.slice(match.index + match[0].length);
  }
  return false;
}

function relaxedCheck(str) {
  if (str[0] === '!') return true;
  var index = 0;
  while (index < str.length) {
    if (/[*?{}()[\]]/.test(str[index])) return true;
    if (str[index] === '\\') {
      var open = str[index + 1];
      index += 2;
      var close = chars[open];
      if (close) {
        var n = str.indexOf(close, index);
        if (n !== -1) index = n + 1;
      }
      if (str[index] === '!') return true;
    } else {
      index += 1;
    }
  }
  return false;
}

function strictCheck(str) {
  if (str[0] === '!') return true;
  var index = 0;
  var pipeIndex = -2;
  var closeSquareIndex = -2;
  var closeCurlyIndex = -2;
  var closeParenIndex = -2;
  var backSlashIndex = -2;

  while (index < str.length) {
    // S1: star
    if (str[index] === '*') return true;

    // S2: quantifier-after-special
    if (str[index + 1] === '?' && /[\].+)]/.test(str[index])) return true;

    // S3: bracket [...]
    if (closeSquareIndex !== -1 && str[index] === '[' && str[index + 1] !== ']') {
      if (closeSquareIndex < index) {
        closeSquareIndex = str.indexOf(']', index);
      }
      if (closeSquareIndex > index) {
        if (backSlashIndex === -1 || backSlashIndex > closeSquareIndex) return true;
        backSlashIndex = str.indexOf('\\', index);
        if (backSlashIndex === -1 || backSlashIndex > closeSquareIndex) return true;
      }
    }

    // S4: brace {...}
    if (closeCurlyIndex !== -1 && str[index] === '{' && str[index + 1] !== '}') {
      closeCurlyIndex = str.indexOf('}', index);
      if (closeCurlyIndex > index) {
        backSlashIndex = str.indexOf('\\', index);
        if (backSlashIndex === -1 || backSlashIndex > closeCurlyIndex) return true;
      }
    }

    // S5: lookaround (?:  (?!  (?=
    if (closeParenIndex !== -1 && str[index] === '(' && str[index + 1] === '?' &&
        /[:!=]/.test(str[index + 2]) && str[index + 3] !== ')') {
      closeParenIndex = str.indexOf(')', index);
      if (closeParenIndex > index) {
        backSlashIndex = str.indexOf('\\', index);
        if (backSlashIndex === -1 || backSlashIndex > closeParenIndex) return true;
      }
    }

    // S6: alternation (a|b)
    if (pipeIndex !== -1 && str[index] === '(' && str[index + 1] !== '|') {
      if (pipeIndex < index) {
        pipeIndex = str.indexOf('|', index);
      }
      if (pipeIndex !== -1 && str[pipeIndex + 1] !== ')') {
        closeParenIndex = str.indexOf(')', pipeIndex);
        if (closeParenIndex > pipeIndex) {
          backSlashIndex = str.indexOf('\\', pipeIndex);
          if (backSlashIndex === -1 || backSlashIndex > closeParenIndex) return true;
        }
      }
    }

    // S7: backslash advance / escaped-bang
    if (str[index] === '\\') {
      var open = str[index + 1];
      index += 2;
      var close = chars[open];
      if (close) {
        var n = str.indexOf(close, index);
        if (n !== -1) index = n + 1;
      }
      if (str[index] === '!') return true;
    } else {
      index += 1;
    }
  }
  return false;
}

export default function isGlob(str, options) {
  // NODE 0: non-string / empty guard
  if (typeof str !== 'string' || str === '') return false;

  // NODE 1: extglob short-circuit
  if (isExtglob(str) === true) return true;

  // NODE 2: strict vs relaxed selection
  if (options && options.strict === false) {
    return relaxedCheck(str);
  }
  return strictCheck(str);
}
