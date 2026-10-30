// @rederive/isSet — verified-recompose of lodash.isset@4.4.2. quorum 3/3, differential 400/400, round 1. SIR: sir/isSet.sir
export default function isSet(value) {
  return !!(!!value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Set]');
}
