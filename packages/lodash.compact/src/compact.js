// @rederive/compact — verified-recompose of lodash.compact@3.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/compact.sir
export default function compact(array) {
  var index = -1,
      length = array ? array.length : 0,
      resIndex = 0,
      result = [];
  while (++index < length) {
    var value = array[index];
    if (value) {
      result[resIndex++] = value;
    }
  }
  return result;
}
