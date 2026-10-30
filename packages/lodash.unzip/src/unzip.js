// @rederive/unzip — verified-recompose of lodash.unzip@3.4.0. quorum 3/3, differential 400/400, round 1. SIR: sir/unzip.sir
const MAX_SAFE_INTEGER = 9007199254740991;

function isLength(value) {
  return typeof value === 'number' &&
    value > -1 &&
    value % 1 === 0 &&
    value <= MAX_SAFE_INTEGER;
}

function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

function isFunction(value) {
  const tag = Object.prototype.toString.call(value);
  return tag === '[object Function]' || tag === '[object GeneratorFunction]';
}

function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

function isArrayLikeObject(value) {
  return isObjectLike(value) && isArrayLike(value);
}

function unzip(array) {
  // NODE 1: top-level guard
  if (!array || !array.length) {
    return [];
  }

  // NODE 2: filter groups + compute max length
  let length = 0;
  const kept = [];
  for (let index = 0; index < array.length; index++) {
    const group = array[index];
    if (isArrayLikeObject(group)) {
      if (group.length > length) {
        length = group.length;
      }
      kept.push(group);
    }
  }

  // NODE 3: regroup / transpose
  const result = [];
  for (let i = 0; i < length; i++) {
    const row = [];
    for (let j = 0; j < kept.length; j++) {
      row.push(kept[j][i]);
    }
    result.push(row);
  }
  return result;
}

export default unzip;
