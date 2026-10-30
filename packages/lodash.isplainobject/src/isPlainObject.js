// @rederive/isPlainObject — verified-recompose of lodash.isplainobject@4.0.6. quorum 3/3, differential 400/400, round 1. SIR: sir/isPlainObject.sir
// Clean-room re-emission of lodash.isplainobject@4.0.6 isPlainObject
// Reconstructed from SIR contract + frozen oracle; no original source consulted.

// Constants captured once at module load (not carried data — derived from host intrinsics).
const objectTag = '[object Object]';
const objectProto = Object.prototype;
const funcProto = Function.prototype;
const funcToString = funcProto.toString;
const hasOwnProperty = objectProto.hasOwnProperty;
const objectToString = objectProto.toString;
// The native Object constructor's source string, as reported by this engine.
const objectCtorString = funcToString.call(Object);

// isObjectLike: truthy AND typeof === 'object'
function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

// isHostObject: returns true only for legacy IE<9 host objects
// (practically unreachable in any standard engine; always false for codec-faithful inputs).
function isHostObject(value) {
  let result = false;
  if (value != null && typeof value.toString !== 'function') {
    try {
      result = !!(value + '');
    } catch (e) {
      // swallow
    }
  }
  return result;
}

// getPrototype: Object.getPrototypeOf
const getPrototype = Object.getPrototypeOf;

export default function isPlainObject(value) {
  // NODE 1: object-like + tag + host-object gate
  if (!isObjectLike(value) ||
      objectToString.call(value) !== objectTag ||
      isHostObject(value)) {
    return false;
  }

  // NODE 2: immediate prototype null check
  const proto = getPrototype(value);
  if (proto === null) {
    return true;
  }

  // NODE 3: constructor identity check
  // proto must have an OWN 'constructor' property; if so, Ctor = proto.constructor, else false.
  const Ctor = hasOwnProperty.call(proto, 'constructor') && proto.constructor;

  return (
    typeof Ctor === 'function' &&
    Ctor instanceof Ctor &&
    funcToString.call(Ctor) === objectCtorString
  );
}
