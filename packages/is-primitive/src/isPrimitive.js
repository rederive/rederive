// @rederive/isPrimitive — verified-recompose of is-primitive@3.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/isPrimitive.sir
export default function isPrimitive(val) {
  if (typeof val === 'object') {
    return val === null;
  }
  return typeof val !== 'function';
}
