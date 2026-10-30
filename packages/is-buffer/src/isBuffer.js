// @rederive/isBuffer — verified-recompose of is-buffer@2.0.5. quorum 3/3, differential 400/400, round 1. SIR: sir/isBuffer.sir
export default function isBuffer(obj) {
  return obj != null &&
    obj.constructor != null &&
    typeof obj.constructor.isBuffer === 'function' &&
    obj.constructor.isBuffer(obj)
}
