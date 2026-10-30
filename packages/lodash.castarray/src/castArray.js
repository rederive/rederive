// @rederive/castArray — verified-recompose of lodash.castarray@4.4.0. quorum 3/3, differential 400/400, round 1. SIR: sir/castArray.sir
function castArray() {
  if (!arguments.length) {
    return [];
  }
  var value = arguments[0];
  return Array.isArray(value) ? value : [value];
}

export default castArray;
