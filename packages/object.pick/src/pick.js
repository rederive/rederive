// @rederive/pick — verified-recompose of object.pick@1.3.0. quorum 3/3, differential 400/400, round 1. SIR: sir/pick.sir
export default function pick(obj, keys) {
  // B0: inlined isObject predicate (isobject@3.0.1)
  function isObject(val) {
    return val != null && typeof val === 'object' && Array.isArray(val) === false;
  }

  // B1: guard — proceed only if obj is a plain object OR a function
  if (!isObject(obj) && typeof obj !== 'function') {
    return {};
  }

  // B2: initialize result
  var res = {};

  // B3: branch on keys type
  if (typeof keys === 'string') {
    // B3a: string form — single key path
    if (keys in obj) {
      res[keys] = obj[keys];
    }
    return res;
  }

  // B3b: array (and array-like fall-through) form
  var len = keys.length;
  var idx = -1;
  while (++idx < len) {
    var key = keys[idx];
    if (key in obj) {
      res[key] = obj[key];
    }
  }
  return res;
}
