// @rederive/eq — verified-recompose of lodash.eq@4.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/eq.sir
export default function eq(value, other) {
  return value === other || (value !== value && other !== other);
}
