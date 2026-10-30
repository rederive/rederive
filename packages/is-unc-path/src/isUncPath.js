// @rederive/isUncPath — verified-recompose of is-unc-path@1.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/isUncPath.sir
const UNC_REGEX = /^[\\\/]{2,}[^\\\/]+[\\\/]+[^\\\/]+/;

export default function isUncPath(filepath) {
  if (typeof filepath !== 'string') {
    throw new TypeError('expected a string');
  }
  return UNC_REGEX.test(filepath);
}
