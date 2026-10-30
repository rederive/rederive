// @rederive/isObjectLike — verified-recompose of lodash.isobjectlike@4.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/isObjectLike.sir
export default function isObjectLike(value) {
  return !!value && typeof value == 'object';
}
