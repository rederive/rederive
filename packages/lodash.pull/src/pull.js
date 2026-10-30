// @rederive/pull — verified-recompose of lodash.pull@4.1.0. quorum 3/3, differential 400/400, round 1. SIR: sir/pull.sir
// Clean-room re-emission of lodash.pull@4.1.0
// SIR contract: pull = baseRest(pullAll), mutates array in-place, returns same reference.
// Equality: SameValueZero (strict === plus NaN===NaN; +0===-0).

function baseIndexOf(array, value, fromIndex) {
  // node-5: NaN path — value !== value means value is NaN
  if (value !== value) {
    for (let i = fromIndex; i < array.length; i++) {
      if (array[i] !== array[i]) return i;
    }
    return -1;
  }
  // node-6: strict === scan (covers +0/-0 collapse since 0 === -0)
  for (let i = fromIndex; i < array.length; i++) {
    if (array[i] === value) return i;
  }
  return -1;
}

function basePullAll(array, values) {
  // node-1 guard: truthy check on all four operands
  if (!(array && array.length && values && values.length)) {
    return array;
  }
  // node-3 outer loop: for each value to remove
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    let fromIndex = 0;
    // node-4 inner loop: remove ALL occurrences
    while (true) {
      fromIndex = baseIndexOf(array, value, fromIndex);
      if (fromIndex === -1) break;
      array.splice(fromIndex, 1);
      // fromIndex is NOT advanced; shifted-down successor is now at same index
    }
  }
  return array;
}

function pull(array, ...values) {
  return basePullAll(array, values);
}

export default pull;
