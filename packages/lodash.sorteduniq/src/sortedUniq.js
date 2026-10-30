// @rederive/sortedUniq — verified-recompose of lodash.sorteduniq@4.2.0. quorum 3/3, differential 400/400, round 1. SIR: sir/sortedUniq.sir
function eq(value, other) {
  return value === other || (value !== value && other !== other);
}

function baseSortedUniq(array) {
  var index = -1;
  var length = array.length;
  var resIndex = 0;
  var result = [];
  var seen;

  while (++index < length) {
    var value = array[index];
    var computed = value;

    if (!index || !eq(computed, seen)) {
      seen = computed;
      result[resIndex++] = (value === 0 ? 0 : value);
    }
  }

  return result;
}

export default function sortedUniq(array) {
  return (array && array.length) ? baseSortedUniq(array) : [];
}
