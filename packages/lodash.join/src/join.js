// @rederive/join — verified-recompose of lodash.join@4.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/join.sir
const nativeJoin = Array.prototype.join;

function join(array, separator) {
  return array ? nativeJoin.call(array, separator) : '';
}

export default join;
