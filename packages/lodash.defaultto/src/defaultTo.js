// @rederive/defaultTo — verified-recompose of lodash.defaultto@4.14.0. quorum 3/3, differential 400/400, round 1. SIR: sir/defaultTo.sir
function defaultTo(value, defaultValue) {
  return (value == null || value !== value) ? defaultValue : value;
}

export default defaultTo;
