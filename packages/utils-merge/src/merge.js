// @rederive/merge — verified-recompose of utils-merge@1.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/merge.sir
export default function merge(a, b) {
  if (a && b) {
    for (var key in b) {
      a[key] = b[key];
    }
  }
  return a;
}
