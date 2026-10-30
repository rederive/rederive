// @rederive/zipObject — verified-recompose of lodash.zipobject@4.18.0. quorum 3/3, differential 400/400, round 1. SIR: sir/zipObject.sir
var defineProperty = (function() {
  try {
    var fn = Object.defineProperty;
    fn({}, '', {});
    return fn;
  } catch (e) {}
}());

function eq(value, other) {
  return value === other || (value !== value && other !== other);
}

function baseAssignValue(object, key, value) {
  if (key === '__proto__' && defineProperty) {
    defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      value: value,
      writable: true
    });
  } else {
    object[key] = value;
  }
}

function assignValue(object, key, value) {
  var objValue = object[key];
  if (!(Object.prototype.hasOwnProperty.call(object, key) && eq(objValue, value)) ||
      (value === undefined && !(key in object))) {
    baseAssignValue(object, key, value);
  }
}

function baseZipObject(props, values, assignFunc) {
  var index = -1,
      length = props.length,
      valsLength = values.length,
      result = {};

  while (++index < length) {
    var value = index < valsLength ? values[index] : undefined;
    assignFunc(result, props[index], value);
  }
  return result;
}

function zipObject(props, values) {
  return baseZipObject(props || [], values || [], assignValue);
}

export default zipObject;
