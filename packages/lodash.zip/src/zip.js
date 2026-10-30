// @rederive/zip — verified-recompose of lodash.zip@4.2.0. quorum 3/3, differential 400/400, round 1. SIR: sir/zip.sir
// Clean-room re-emission of lodash.zip@4.2.0
// Reconstructed from SIR + frozen oracle only.

const MAX_SAFE_INTEGER = 9007199254740991;

function isLength(value) {
  return (
    typeof value === 'number' &&
    value > -1 &&
    value % 1 === 0 &&
    value <= MAX_SAFE_INTEGER
  );
}

function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

function isObject(value) {
  return !!value && (typeof value === 'object' || typeof value === 'function');
}

function isFunction(value) {
  if (!isObject(value)) return false;
  const tag = Object.prototype.toString.call(value);
  return tag === '[object Function]' || tag === '[object GeneratorFunction]';
}

function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

function isArrayLikeObject(value) {
  return isObjectLike(value) && isArrayLike(value);
}

function zip(...args) {
  // NODE 1: empty guard
  if (!args || !args.length) {
    return [];
  }

  // NODE 2: filter to kept groups, compute max length
  const kept = [];
  let length = 0;
  for (let k = 0; k < args.length; k++) {
    const g = args[k];
    if (isArrayLikeObject(g)) {
      kept.push(g);
      if (g.length > length) {
        length = g.length;
      }
    }
  }

  // NODE 3/4: build transpose
  const result = new Array(length);
  for (let i = 0; i < length; i++) {
    const row = new Array(kept.length);
    for (let j = 0; j < kept.length; j++) {
      row[j] = kept[j][i]; // undefined if out of bounds or hole
    }
    result[i] = row;
  }

  return result;
}

export default zip;
