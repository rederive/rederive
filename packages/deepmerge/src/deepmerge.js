// @rederive/deepmerge — verified-recompose of deepmerge@4.3.1. quorum 3/3, differential 400/400, round 1. SIR: sir/deepmerge.sir
// Clean-room re-emission of deepmerge@4.3.1 default export
// Reconstructed from SIR + frozen oracle only. No source consulted.

function isNonNullObject(v) {
  return (!!v) && (typeof v === 'object');
}

function isReactElement(v) {
  const reactElementType = (typeof Symbol === 'function' && Symbol.for)
    ? Symbol.for('react.element')
    : 0xeac7;
  return v.$$typeof === reactElementType;
}

function isSpecial(v) {
  const s = Object.prototype.toString.call(v);
  return s === '[object RegExp]'
      || s === '[object Date]'
      || isReactElement(v);
}

function isMergeableObject(v) {
  return isNonNullObject(v) && !isSpecial(v);
}

function emptyTarget(val) {
  return Array.isArray(val) ? [] : {};
}

function cloneUnlessOtherwiseSpecified(value, options) {
  if (options.clone !== false && options.isMergeableObject(value)) {
    return deepmerge(emptyTarget(value), value, options);
  } else {
    return value;
  }
}

function getEnumerableOwnPropertySymbols(target) {
  return Object.getOwnPropertySymbols(target).filter(symbol =>
    Object.prototype.propertyIsEnumerable.call(target, symbol)
  );
}

function getKeys(target) {
  return Object.keys(target).concat(getEnumerableOwnPropertySymbols(target));
}

function propertyIsOnObject(object, property) {
  try {
    return (property in object);
  } catch (_) {
    return false;
  }
}

function propertyIsUnsafe(target, key) {
  return propertyIsOnObject(target, key)
      && !(Object.prototype.hasOwnProperty.call(target, key)
           && Object.prototype.propertyIsEnumerable.call(target, key));
}

function getMergeFunction(key, options) {
  if (!options.customMerge) return deepmerge;
  const cm = options.customMerge(key);
  return (typeof cm === 'function') ? cm : deepmerge;
}

function defaultArrayMerge(target, source, options) {
  return target.concat(source).map(el => cloneUnlessOtherwiseSpecified(el, options));
}

function mergeObject(target, source, options) {
  const destination = {};
  if (options.isMergeableObject(target)) {
    for (const key of getKeys(target)) {
      destination[key] = cloneUnlessOtherwiseSpecified(target[key], options);
    }
  }
  for (const key of getKeys(source)) {
    if (propertyIsUnsafe(target, key)) {
      continue;
    }
    if (propertyIsOnObject(target, key) && options.isMergeableObject(source[key])) {
      destination[key] = getMergeFunction(key, options)(target[key], source[key], options);
    } else {
      destination[key] = cloneUnlessOtherwiseSpecified(source[key], options);
    }
  }
  return destination;
}

function deepmerge(target, source, options) {
  options = options || {};
  options.arrayMerge = options.arrayMerge || defaultArrayMerge;
  options.isMergeableObject = options.isMergeableObject || isMergeableObject;
  options.cloneUnlessOtherwiseSpecified = cloneUnlessOtherwiseSpecified;

  const sourceIsArray = Array.isArray(source);
  const targetIsArray = Array.isArray(target);
  const typesMatch = (sourceIsArray === targetIsArray);

  if (!typesMatch) {
    // BRANCH A: types do not match — source wins wholesale
    return cloneUnlessOtherwiseSpecified(source, options);
  } else if (sourceIsArray) {
    // BRANCH B: both are Arrays
    return options.arrayMerge(target, source, options);
  } else {
    // BRANCH C: neither is an Array
    return mergeObject(target, source, options);
  }
}

export default deepmerge;
