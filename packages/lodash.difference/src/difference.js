// @rederive/difference — verified-recompose of lodash.difference@4.5.0. quorum 3/3, differential 400/400, round 1. SIR: sir/difference.sir
function isLength(n) {
  return typeof n === 'number' && n > -1 && n % 1 === 0 && n <= 9007199254740991;
}

function isArrayLikeObject(v) {
  if (v === null || typeof v !== 'object') return false;
  return isLength(v.length);
}

function difference(array, ...values) {
  if (!isArrayLikeObject(array)) return [];

  // Build exclusion list: flatten rest-args one level, only array-like-object args
  const exclude = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (isArrayLikeObject(v)) {
      for (let j = 0; j < v.length; j++) {
        exclude.push(v[j]);
      }
    }
  }

  const valuesLength = exclude.length;
  const result = [];

  for (let i = 0; i < array.length; i++) {
    const value = array[i];
    // -0 normalization on output
    const emit = (value !== 0) ? value : 0;

    let excluded = false;
    if (value !== value) {
      // value is NaN — excluded iff exclude contains any NaN
      for (let j = 0; j < valuesLength; j++) {
        if (exclude[j] !== exclude[j]) {
          excluded = true;
          break;
        }
      }
    } else {
      // fast path: strict === scan
      for (let j = 0; j < valuesLength; j++) {
        if (exclude[j] === value) {
          excluded = true;
          break;
        }
      }
    }

    if (!excluded) {
      result.push(emit);
    }
  }

  return result;
}

export default difference;
