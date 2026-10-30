// @rederive/escapeStringRegexp — verified-recompose of escape-string-regexp@1.0.5. quorum 3/3, differential 400/400, round 1. SIR: sir/escapeStringRegexp.sir
const matchOperatorsRe = /[|\\{}()[\]^$+*?.]/g;

export default function escapeStringRegexp(str) {
  if (typeof str !== 'string') {
    throw new TypeError('Expected a string');
  }
  return str.replace(matchOperatorsRe, '\\$&');
}
