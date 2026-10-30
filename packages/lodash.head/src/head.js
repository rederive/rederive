// @rederive/head — verified-recompose of lodash.head@4.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/head.sir
export default function head(array) {
  return (array && array.length) ? array[0] : undefined;
}
