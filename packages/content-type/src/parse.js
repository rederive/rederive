// @rederive/parse — verified-recompose of content-type@1.0.5. quorum 3/3, differential 400/400, round 2. SIR: sir/parse.sir
// Clean-room re-emission of content-type@1.0.5 `parse`
// SIR-conformant: parameters-before-type key order, null-prototype parameters,
// exact regex constants, exact TypeError messages.

// TYPE_REGEXP: ^TCHAR+/TCHAR+$
const TYPE_REGEXP = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

// PARAM_REGEXP (global): ; SPACE* (KEY=TCHAR+) SPACE* = SPACE* (VALUE) SPACE*
// VALUE is either a quoted-string or a token
const PARAM_REGEXP = /; *([!#$%&'*+.^_`|~0-9A-Za-z-]+) *= *("(?:[ !#-\[\]-~-ÿ]|\\[ -ÿ])*"|[!#$%&'*+.^_`|~0-9A-Za-z-]+) */g;

// QESC_REGEXP: unescape \X -> X for chars in space-ÿ range
const QESC_REGEXP = /\\([ -ÿ])/g;

function getcontenttype(obj) {
  let header;
  if (typeof obj.getHeader === 'function') {
    // res-like: call getHeader with 'content-type'
    header = obj.getHeader('content-type');
  } else if (typeof obj.headers === 'object') {
    // req-like: read headers['content-type'] (short-circuit if obj.headers is null/falsy)
    header = obj.headers && obj.headers['content-type'];
  }
  // header stays undefined if neither branch matched
  if (typeof header !== 'string') {
    throw new TypeError('content-type header is missing from object');
  }
  return header;
}

export function parse(string) {
  // NODE 1: falsy guard
  if (!string) {
    throw new TypeError('argument string is required');
  }

  // NODE 2: resolve header from object-or-string
  let header;
  if (typeof string === 'object') {
    header = getcontenttype(string);
  } else {
    header = string;
  }

  // NODE 3: header must be a string
  if (typeof header !== 'string') {
    throw new TypeError('argument string is required to be a string');
  }

  // NODE 4: split type vs parameters at the FIRST ';'
  const index0 = header.indexOf(';');
  const type = (index0 !== -1) ? header.slice(0, index0).trim() : header.trim();

  // NODE 5: validate type against TYPE_REGEXP
  if (!TYPE_REGEXP.test(type)) {
    throw new TypeError('invalid media type');
  }

  // NODE 6: construct result with parameters FIRST (null-prototype), type LAST
  const obj = { parameters: Object.create(null) };

  // NODE 7: parse parameters (only if ';' was present)
  let index = index0;
  if (index !== -1) {
    PARAM_REGEXP.lastIndex = index;
    let match;
    while ((match = PARAM_REGEXP.exec(header)) !== null) {
      // NODE 7a: contiguous check
      if (match.index !== index) {
        throw new TypeError('invalid parameter format');
      }
      // NODE 7b: advance index by the full match length
      index = index + match[0].length;
      // NODE 7c: key lowercased
      const key = match[1].toLowerCase();
      // NODE 7d: raw value
      let value = match[2];
      // NODE 7e: unquote if quoted
      if (value.charCodeAt(0) === 0x22) {
        value = value.slice(1, -1);
        if (value.indexOf('\\') !== -1) {
          value = value.replace(QESC_REGEXP, '$1');
        }
      }
      // NODE 7f: assign (preserves case, scan order, duplicate = last value wins)
      obj.parameters[key] = value;
    }
    // NODE 7g: trailing character check
    if (index !== header.length) {
      throw new TypeError('invalid parameter format');
    }
  }

  // NODE 6 cont.: assign type LAST (parameters was created first => correct key order)
  obj.type = type.toLowerCase();

  // NODE 8: return
  return obj;
}
