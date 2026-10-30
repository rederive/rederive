// @rederive/compare — verified-recompose of just-compare@2.3.0. quorum 3/3, differential 400/400, round 1. SIR: sir/compare.sir
function compareArrays(a, b) {
  var len = a.length;
  if (len != b.length) return false;
  for (var i = 0; i < len; i++) {
    if (!compare(a[i], b[i])) return false;
  }
  return true;
}

function compareObjects(value1, value2) {
  var keys1 = Object.keys(value1);
  var len = keys1.length;
  if (len != Object.keys(value2).length) return false;
  for (var i = 0; i < len; i++) {
    var key1 = keys1[i];
    if (!(value2.hasOwnProperty(key1) && compare(value1[key1], value2[key1]))) return false;
  }
  return true;
}

function compareNativeSubtypes(value1, value2) {
  return value1.toString() === value2.toString();
}

function compare(value1, value2) {
  // NODE 0 — identity short-circuit
  if (value1 === value2) return true;

  // NODE 1 — both-NaN tail
  if (value1 !== value1 && value2 !== value2) return true;

  // NODE 2 — typeof-mismatch OR tag-mismatch gate
  if (typeof value1 != typeof value2 || {}.toString.call(value1) != {}.toString.call(value2)) return false;

  // NODE 3 — non-object primitive guard
  if (value1 !== Object(value1)) return false;

  // NODE 4 — falsy-object guard
  if (!value1) return false;

  // NODE 5 — Array branch
  if (Array.isArray(value1)) return compareArrays(value1, value2);

  // NODE 6 — Set branch
  if ({}.toString.call(value1) == '[object Set]') return compareArrays(Array.from(value1), Array.from(value2));

  // NODE 7 — plain-Object branch
  if ({}.toString.call(value1) == '[object Object]') return compareObjects(value1, value2);

  // NODE 8 — compareNativeSubtypes fallback
  return compareNativeSubtypes(value1, value2);
}

export default compare;
