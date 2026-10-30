// @rederive/arrDiff — verified-recompose of arr-diff@4.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/arrDiff.sir
// Clean-room re-emission of arr-diff@4.0.0 from SIR contract.
// Emitter #3 of 3.

function diffArray(one, two) {
  if (!Array.isArray(two)) {
    // BRANCH A: two is not an array — return shallow copy of one via .slice()
    return one.slice();
  }
  // BRANCH B: two is an array — filter one, keeping elements not found in two
  var result = [];
  for (var oi = 0; oi < one.length; oi++) {
    var ele = one[oi];
    var hasEle = false;
    for (var ti = 0; ti < two.length; ti++) {
      if (ele === two[ti]) {
        hasEle = true;
        break;
      }
    }
    if (hasEle === false) {
      result.push(ele);
    }
  }
  return result;
}

export default function diff(arr) {
  // NODE 0: N == 0 -> return undefined (arr is never assigned)
  if (arguments.length === 0) {
    return undefined;
  }

  // NODE 1: accumulator is first argument
  var acc = arguments[0];

  // NODE 2: fold over remaining arguments
  for (var idx = 1; idx < arguments.length; idx++) {
    acc = diffArray(acc, arguments[idx]);
  }

  return acc;
}
