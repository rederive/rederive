// @rederive/arrFlatten — verified-recompose of arr-flatten@1.1.0. quorum 3/3, differential 400/400, round 1. SIR: sir/arrFlatten.sir
function flat(arr, res) {
  var i = 0, cur;
  var len = arr.length;
  for (; i < len; i++) {
    cur = arr[i];
    Array.isArray(cur) ? flat(cur, res) : res.push(cur);
  }
  return res;
}

export default function arrFlatten(arr) {
  return flat(arr, []);
}
