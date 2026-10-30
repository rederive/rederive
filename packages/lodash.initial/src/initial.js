// @rederive/initial — verified-recompose of lodash.initial@4.1.1. quorum 3/3, differential 400/400, round 1. SIR: sir/initial.sir
// Clean-room re-emission of lodash.initial@4.1.1
// Reconstructed from SIR contract — do not edit manually.

function baseSlice(array, start, end) {
  var index = -1;
  var length = array.length;

  // start normalization (start === 0, so this block is inert for our caller,
  // but implemented faithfully per the SIR pseudocode)
  if (start < 0) {
    start = (-start > length) ? 0 : (length + start);
  }

  // end normalization
  end = (end > length) ? length : end;
  if (end < 0) {
    end = end + length;  // KEY LINE: for end=-1 -> end = length - 1
  }

  // compute result length: (start > end) ? 0 : ((end - start) >>> 0)
  length = (start > end) ? 0 : ((end - start) >>> 0);
  start = start >>> 0;

  // dense copy
  var result = Array(length);
  while (++index < length) {
    result[index] = array[index + start];
  }
  return result;
}

function initial(array) {
  // NODE-0: outer guard
  var length = array ? array.length : 0;
  return length ? baseSlice(array, 0, -1) : [];
}

export default initial;
