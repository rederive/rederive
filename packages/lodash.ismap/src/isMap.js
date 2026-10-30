// @rederive/isMap — verified-recompose of lodash.ismap@4.4.2. quorum 3/3, differential 400/400, round 1. SIR: sir/isMap.sir
export default function isMap(value) {
  return !!value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Map]';
}
