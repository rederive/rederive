// @rederive/defaults — verified-recompose of lodash.defaults@4.2.0. quorum 3/3, differential 400/400, round 1. SIR: sir/defaults.sir
const objectProto = Object.prototype;
const hasOwn = (o, k) => objectProto.hasOwnProperty.call(o, k);
const eq = (x, y) => x === y || (x !== x && y !== y);

function defaults(object, ...sources) {
  // N0: coerce destination
  object = Object(object);

  // N1: iterate sources left-to-right
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];

    // N1a: skip falsy sources
    if (!source) continue;

    // N2: enumerate own + inherited enumerable string keys via for-in
    for (const key in source) {
      const objValue = object[key];
      const srcValue = source[key];

      // N3: defaults guard
      // assign if: objValue is undefined
      //         OR (eq(objValue, objectProto[key]) AND object does not own key)
      let assignedValue;
      if (objValue === undefined ||
          (eq(objValue, objectProto[key]) && !hasOwn(object, key))) {
        assignedValue = srcValue;
      } else {
        assignedValue = objValue;
      }

      // N4: assign only when needed (observable: ensure object owns key with assignedValue)
      if (!(hasOwn(object, key) && eq(object[key], assignedValue)) ||
          (assignedValue === undefined && !(key in object))) {
        object[key] = assignedValue;
      }
    }
  }

  // N5: return same reference
  return object;
}

export default defaults;
