// @rederive/arrayUniq — verified-recompose of array-uniq@1.0.3. quorum 3/3, differential 400/400, round 1. SIR: sir/arrayUniq.sir
export default function arrayUniq(arr) {
  var ret = [];
  (new Set(arr)).forEach(function (el) { ret.push(el); });
  return ret;
}
