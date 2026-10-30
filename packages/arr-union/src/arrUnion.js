// @rederive/arrUnion — verified-recompose of arr-union@3.1.0. quorum 3/3, differential 400/400, round 2. SIR: sir/arrUnion.sir
export default function arrUnion(init) {
  if (!Array.isArray(init)) {
    throw new TypeError('arr-union expects the first argument to be an array.');
  }

  var len = arguments.length;
  var i = 0;

  while (++i < len) {
    var arg = arguments[i];

    if (!arg) continue;

    if (!Array.isArray(arg)) {
      arg = [arg];
    }

    for (var j = 0; j < arg.length; j++) {
      var ele = arg[j];
      if (init.indexOf(ele) >= 0) {
        continue;
      }
      init.push(ele);
    }
  }

  return init;
}
