// @rederive/isRelative — verified-recompose of is-relative@1.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/isRelative.sir
export default function isRelative(filepath) {
  if (typeof filepath !== 'string') {
    throw new TypeError('expected filepath to be a string');
  }
  const unc = /^[\\\/]{2,}[^\\\/]+[\\\/]+[^\\\/]+/.test(filepath);
  const driveSep = /^([a-z]:)?[\\\/]/i.test(filepath);
  return !unc && !driveSep;
}
