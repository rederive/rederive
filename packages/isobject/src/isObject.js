// @rederive/isObject — verified-recompose of isobject@4.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/isObject.sir
export default function isObject(val) {
  return val != null && typeof val === 'object' && Array.isArray(val) === false;
}
