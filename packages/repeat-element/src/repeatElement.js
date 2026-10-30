// @rederive/repeatElement — verified-recompose of repeat-element@1.1.4. quorum 3/3, differential 400/400, round 1. SIR: sir/repeatElement.sir
export default function repeat(ele, num) {
  return new Array(num).fill(ele);
}
