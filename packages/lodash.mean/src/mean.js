// @rederive/mean — verified-recompose of lodash.mean@4.1.0. quorum 3/3, differential 400/400, round 1. SIR: sir/mean.sir
const NAN = 0 / 0;

function identity(value) {
  return value;
}

function baseSum(array, iteratee) {
  let result = undefined;
  let index = -1;
  const length = array.length;
  while (++index < length) {
    const current = iteratee(array[index]);
    if (current !== undefined) {
      result = (result === undefined) ? current : (result + current);
    }
  }
  return result;
}

function baseMean(array, iteratee) {
  const length = array ? array.length : 0;
  return length ? (baseSum(array, iteratee) / length) : NAN;
}

function mean(array) {
  return baseMean(array, identity);
}

export default mean;
