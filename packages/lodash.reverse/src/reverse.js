// @rederive/reverse — verified-recompose of lodash.reverse@4.0.1. quorum 3/3, differential 400/400, round 2. SIR: sir/reverse.sir
var arrayProto = Array.prototype;
var nativeReverse = arrayProto.reverse;

function reverse(array) {
  return array ? nativeReverse.call(array) : array;
}

export default reverse;
