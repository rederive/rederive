// @rederive/isPlainObject — verified-recompose of is-plain-object@5.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/isPlainObject.sir
// Reconstructed from SIR contract: is-plain-object@5.0.0
// Algorithm: toString-tag + hasOwnProperty('isPrototypeOf') (5.x algorithm)

function isObject(x) {
  return Object.prototype.toString.call(x) === '[object Object]';
}

export function isPlainObject(o) {
  // NODE-1 [tag gate]
  if (isObject(o) === false) return false;

  // NODE-2 [constructor own-or-inherited lookup]
  const ctor = o.constructor;
  if (ctor === undefined) return true;

  // NODE-3 [prototype tag gate]
  const prot = ctor.prototype;
  if (isObject(prot) === false) return false;

  // NODE-4 [own 'isPrototypeOf' gate]
  if (prot.hasOwnProperty('isPrototypeOf') === false) return false;

  // NODE-5 [success]
  return true;
}

export default isPlainObject;
