// @rederive/isExtendable — verified-recompose of is-extendable@1.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/isExtendable.sir
// Clean-room reconstruction of is-extendable@1.0.1
// Inlines: isobject@3.0.1 + is-plain-object@2.0.4
// ES module, default export, no imports.

function isObject(val) {
  return val != null && typeof val === 'object' && Array.isArray(val) === false;
}

function isObjectObject(o) {
  return isObject(o) === true && Object.prototype.toString.call(o) === '[object Object]';
}

function isPlainObject(o) {
  var ctor, prot;
  if (isObjectObject(o) === false) return false;        // C.1
  ctor = o.constructor;
  if (typeof ctor !== 'function') return false;         // C.2
  prot = ctor.prototype;
  if (isObjectObject(prot) === false) return false;     // C.3
  if (prot.hasOwnProperty('isPrototypeOf') === false)   // C.4
    return false;
  return true;                                          // C.5
}

export default function isExtendable(val) {
  return isPlainObject(val) || typeof val === 'function' || Array.isArray(val);
}
