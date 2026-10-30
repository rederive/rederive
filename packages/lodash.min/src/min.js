// @rederive/min — verified-recompose of lodash.min@4.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/min.sir
// Clean-room re-emission of lodash.min@4.0.1
// Reconstructed from SIR contract and frozen oracle only.
// Zero dependencies.

function isObjectLike(value) {
  return value != null && typeof value === 'object';
}

function isSymbol(value) {
  return typeof value === 'symbol' ||
    (isObjectLike(value) && Object.prototype.toString.call(value) === '[object Symbol]');
}

function identity(value) {
  return value;
}

function baseLt(value, other) {
  return value < other;
}

function baseExtremum(array, iteratee, comparator) {
  var index = -1;
  var length = array.length;
  var computed;
  var result;

  while (++index < length) {
    var value = array[index];
    var current = iteratee(value);

    if (current != null &&
        (computed === undefined
          ? (current === current && !isSymbol(current))
          : comparator(current, computed)
        )
    ) {
      computed = current;
      result = value;
    }
  }
  return result;
}

function min(array) {
  return (array && array.length)
    ? baseExtremum(array, identity, baseLt)
    : undefined;
}

export default min;
