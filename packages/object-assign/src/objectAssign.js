// @rederive/objectAssign — verified-recompose of object-assign@4.1.1. quorum 2/3, differential 400/400, round 1. SIR: sir/objectAssign.sir
'use strict';

function objectAssign(target, ...sources) {
  if (target === null || target === undefined) {
    throw new TypeError('Cannot convert undefined or null to object');
  }

  const to = Object(target);

  const hasOwnProperty = Object.prototype.hasOwnProperty;
  const propertyIsEnumerable = Object.prototype.propertyIsEnumerable;

  for (let i = 0; i < sources.length; i++) {
    const from = Object(sources[i]);

    // Copy own enumerable string keys (hasOwnProperty-filtered for..in)
    for (const key in from) {
      if (hasOwnProperty.call(from, key)) {
        to[key] = from[key];
      }
    }

    // Copy own enumerable symbol keys
    if (Object.getOwnPropertySymbols) {
      const symbols = Object.getOwnPropertySymbols(from);
      for (let j = 0; j < symbols.length; j++) {
        const sym = symbols[j];
        if (propertyIsEnumerable.call(from, sym)) {
          to[sym] = from[sym];
        }
      }
    }
  }

  return to;
}

export default objectAssign;
