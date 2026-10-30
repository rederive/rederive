// @rederive/encodeUrl — verified-recompose of encodeurl@1.0.2. quorum 3/3, differential 400/400, round 1. SIR: sir/encodeUrl.sir
// Clean-room re-emission of encodeurl@1.0.2 default export.
// Reconstructed strictly from SIR contract + frozen oracle.

var ENCODE_CHARS_REGEXP = /(?:[^\x21\x25\x26-\x3B\x3D\x3F-\x5B\x5D\x5F\x61-\x7A\x7E]|%(?:[^0-9A-Fa-f]|[0-9A-Fa-f][^0-9A-Fa-f]|$))+/g

var UNMATCHED_SURROGATE_PAIR_REGEXP = /(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF]([^\uDC00-\uDFFF]|$)/g

var UNMATCHED_SURROGATE_PAIR_REPLACE = '$1�$2'

function encodeUrl (url) {
  return String(url)
    .replace(UNMATCHED_SURROGATE_PAIR_REGEXP, UNMATCHED_SURROGATE_PAIR_REPLACE)
    .replace(ENCODE_CHARS_REGEXP, encodeURI)
}

export default encodeUrl
