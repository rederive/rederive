// @rederive/toObjectPath — verified-recompose of to-object-path@0.3.0. quorum 3/3, differential 400/400, round 1. SIR: sir/toObjectPath.sir
// Clean-room reconstruction of to-object-path@0.3.0 (MIT, Jon Schlinkert)
// Implements the SIR spec exactly: variadic args, recursive deep-flatten of Arrays,
// keep-predicate typeof === 'string' only, join('.') with no post-processing.

function filter(arr) {
  var res = [];
  for (var idx = 0; idx < arr.length; idx++) {
    var ele = arr[idx];
    // node 4: recurse branch — arguments objects or Arrays
    var isArguments = Object.prototype.toString.call(ele) === '[object Arguments]';
    if (isArguments || Array.isArray(ele)) {
      var nested = filter(ele);
      for (var i = 0; i < nested.length; i++) {
        res.push(nested[i]);
      }
    } else if (typeof ele === 'string') {
      // node 5: keep branch — primitive strings only
      res.push(ele);
    }
    // node 6: drop everything else (numbers, booleans, null, undefined, objects, etc.)
  }
  return res;
}

export default function toObjectPath() {
  // node 1: A = full positional arguments list (in-envelope: a0 is never a real arguments object)
  var A;
  var a0 = arguments[0];
  var isArguments0 = Object.prototype.toString.call(a0) === '[object Arguments]';
  if (isArguments0) {
    // a0 IS a JS arguments object — use it directly (branch NOT taken)
    A = a0;
  } else {
    // normal case — A = full arguments list
    A = arguments;
  }

  // node 2: filter
  var res = filter(A);

  // node 3: join with '.' — no trailing/leading dot strip, no trimming
  return res.join('.');
}
