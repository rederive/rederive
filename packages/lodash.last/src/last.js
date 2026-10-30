// @rederive/last — verified-recompose of lodash.last@3.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/last.sir
function last(array) {
  const length = array ? array.length : 0;
  return length ? array[length - 1] : undefined;
}

export default last;
