// @rederive/tail — verified-recompose of lodash.tail@4.1.1. quorum 3/3, differential 400/400, round 2. SIR: sir/tail.sir
function baseSlice(array, start, end) {
  var index = -1;
  var len = array.length;
  if (end > len) {
    end = len;
  }
  if (end < 0) {
    end += len;
  }
  var resultLen = (start > end) ? 0 : ((end - start) >>> 0);
  start = start >>> 0;
  var result = new Array(resultLen);
  while (++index < resultLen) {
    result[index] = array[index + start];
  }
  return result;
}

function tail(array) {
  var length = array ? array.length : 0;
  return length ? baseSlice(array, 1, length) : [];
}

export default tail;
