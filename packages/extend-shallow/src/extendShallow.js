// @rederive/extendShallow — verified-recompose of extend-shallow@3.0.2. quorum 3/3, differential 400/400, round 1. SIR: sir/extendShallow.sir
// Clean-room re-emission of extend-shallow@3.0.2
// SIR NODE 0: the live export is Object.assign (the fallback is dead code).
// All documented behavior (null/undefined target throw, source null/undefined skip,
// shallow by-reference copy, last-wins, string index props, etc.) is natively
// provided by Object.assign.

const extendShallow = Object.assign;

export default extendShallow;
