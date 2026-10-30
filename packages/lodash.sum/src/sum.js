// @rederive/sum — verified-recompose of lodash.sum@4.0.2. quorum 3/3, differential 400/400, round 1. SIR: sir/sum.sir
function identity(value) {
  return value;
}

function baseSum(array, iteratee) {
  var result;
  var index = -1;
  var length = array.length;
  while (++index < length) {
    var current = iteratee(array[index]);
    if (current !== undefined) {
      result = (result === undefined) ? current : (result + current);
    }
  }
  return result;
}

function sum(array) {
  return (array && array.length) ? baseSum(array, identity) : 0;
}

export default sum;
