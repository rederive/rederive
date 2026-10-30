// @rederive/isString — verified-recompose of lodash.isstring@4.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/isString.sir
// Clean-room re-emission of lodash.isstring@4.0.1 isString
// Reconstructed from SIR behavioral contract and frozen oracle.

const stringTag = '[object String]';
const objectToString = Object.prototype.toString;
const isArray = Array.isArray;

function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

function isString(value) {
  return typeof value === 'string' ||
    (!isArray(value) && isObjectLike(value) && objectToString.call(value) === stringTag);
}

export default isString;
