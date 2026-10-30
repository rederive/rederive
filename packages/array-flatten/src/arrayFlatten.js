// @rederive/arrayFlatten — verified-recompose of array-flatten@3.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/arrayFlatten.sir
// Clean-room re-emission of array-flatten@3.0.0
// Reconstructed from SIR + frozen oracle. Zero dependencies.

function $flatten(array, result) {
  for (let i = 0; i < array.length; i++) {
    const value = array[i];
    if (Array.isArray(value)) {
      $flatten(value, result);
    } else {
      result.push(value);
    }
  }
}

export function flatten(array) {
  const result = [];
  $flatten(array, result);
  return result;
}
