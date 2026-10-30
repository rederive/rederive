// @rederive/pullAll — verified-recompose of lodash.pullall@4.2.0. quorum 3/3, differential 400/400, round 1. SIR: sir/pullAll.sir
function sameValueZeroIndexOf(arr, value, from) {
  if (value !== value) { // NaN check
    for (let i = from; i < arr.length; i++) {
      if (arr[i] !== arr[i]) return i;
    }
    return -1;
  }
  for (let i = from; i < arr.length; i++) {
    if (arr[i] === value) return i;
  }
  return -1;
}

function pullAll(array, values) {
  if (!(array && array.length && values && values.length)) return array;
  for (let vi = 0; vi < values.length; vi++) {
    const value = values[vi];
    let fromIndex = 0;
    while ((fromIndex = sameValueZeroIndexOf(array, value, fromIndex)) > -1) {
      array.splice(fromIndex, 1);
    }
  }
  return array;
}

export default pullAll;
