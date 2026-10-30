// @rederive/fromPairs — verified-recompose of lodash.frompairs@4.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/fromPairs.sir
export default function fromPairs(pairs) {
  var index = -1,
      length = pairs ? pairs.length : 0,
      result = {};
  while (++index < length) {
    var pair = pairs[index];
    result[pair[0]] = pair[1];
  }
  return result;
}
