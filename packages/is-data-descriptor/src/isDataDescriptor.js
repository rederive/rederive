// @rederive/isDataDescriptor — verified-recompose of is-data-descriptor@1.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/isDataDescriptor.sir
const data = Object.assign(Object.create(null), {
  configurable: 'boolean',
  enumerable: 'boolean',
  writable: 'boolean'
});

function isDataDescriptor(obj, prop) {
  // NODE A: non-object guard
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  // NODE B: prop-form — only when prop is a STRING
  if (typeof prop === 'string') {
    const val = Object.getOwnPropertyDescriptor(obj, prop);
    return typeof val !== 'undefined';
  }

  // NODE C: no-payload / accessor-presence rejection
  if (
    (!('value' in obj) && !('writable' in obj)) ||
    ('get' in obj) ||
    ('set' in obj)
  ) {
    return false;
  }

  // NODE D: per-key type validation loop
  for (const key in obj) {
    if (
      key !== 'value' &&
      Object.prototype.hasOwnProperty.call(obj, key) &&
      Object.prototype.hasOwnProperty.call(data, key) &&
      typeof obj[key] !== data[key] &&
      typeof obj[key] !== 'undefined'
    ) {
      return false;
    }
  }

  // NODE F: default
  return true;
}

export default isDataDescriptor;
