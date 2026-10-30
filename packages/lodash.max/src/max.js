// @rederive/max — verified-recompose of lodash.max@4.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/max.sir
// Clean-room re-emission of lodash.max@4.0.1 from SIR contract.
// Default export: max(array) -> * (maximum element or undefined)

function isObjectLike(value) {
  return value != null && typeof value === 'object';
}

function isSymbol(value) {
  const type = typeof value;
  return type === 'symbol' ||
    (isObjectLike(value) && Object.prototype.toString.call(value) === '[object Symbol]');
}

function baseGt(value, other) {
  return value > other;
}

function identity(value) {
  return value;
}

function baseExtremum(array, iteratee, comparator) {
  var result = undefined;
  var computed = undefined;

  for (var index = 0; index < array.length; index++) {
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

export default function max(array) {
  if (!(array && array.length)) {
    return undefined;
  }
  return baseExtremum(array, identity, baseGt);
}
