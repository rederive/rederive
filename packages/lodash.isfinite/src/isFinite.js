// @rederive/isFinite — verified-recompose of lodash.isfinite@3.3.2. quorum 3/3, differential 400/400, round 1. SIR: sir/isFinite.sir
var nativeIsFinite = globalThis.isFinite;

function isFinite(value) {
  return typeof value == 'number' && nativeIsFinite(value);
}

export default isFinite;
