// @rederive/extend — verified-recompose of extend@3.0.2. quorum 3/3, differential 400/400, round 1. SIR: sir/extend.sir
var hasOwn = Object.prototype.hasOwnProperty;
var toStr = Object.prototype.toString;
var defineProperty = Object.defineProperty;
var gOPD = Object.getOwnPropertyDescriptor;

function isArray(arr) {
  if (typeof Array.isArray === 'function') {
    return Array.isArray(arr);
  }
  return toStr.call(arr) === '[object Array]';
}

function isPlainObject(obj) {
  if (!obj || toStr.call(obj) !== '[object Object]') {
    return false;
  }
  var hasOwnConstructor = hasOwn.call(obj, 'constructor');
  var hasIsPrototypeOf = obj.constructor && obj.constructor.prototype
    && hasOwn.call(obj.constructor.prototype, 'isPrototypeOf');
  if (obj.constructor && !hasOwnConstructor && !hasIsPrototypeOf) {
    return false;
  }
  var key;
  for (key in obj) { /* empty */ }
  return typeof key === 'undefined' || hasOwn.call(obj, key);
}

function setProperty(target, opts) {
  var name = opts.name;
  var newValue = opts.newValue;
  if (defineProperty && name === '__proto__') {
    defineProperty(target, '__proto__', {
      enumerable: true,
      configurable: true,
      value: newValue,
      writable: true
    });
  } else {
    target[name] = newValue;
  }
}

function getProperty(obj, name) {
  if (name === '__proto__') {
    if (!hasOwn.call(obj, name)) {
      return undefined;
    } else if (gOPD) {
      return gOPD(obj, name).value;
    }
  }
  return obj[name];
}

function extend() {
  var options, name, src, copy, copyIsArray, clone;
  var target = arguments[0];
  var i = 1;
  var length = arguments.length;
  var deep = false;

  if (typeof arguments[0] === 'boolean') {
    deep = arguments[0];
    target = arguments[1] || {};
    i = 2;
  }

  if (target == null || (typeof target !== 'object' && typeof target !== 'function')) {
    target = {};
  }

  for (; i < length; ++i) {
    options = arguments[i];
    if (options != null) {
      for (name in options) {
        src = getProperty(target, name);
        copy = getProperty(options, name);

        if (target === copy) {
          continue;
        }

        if (deep && copy && (isPlainObject(copy) || (copyIsArray = isArray(copy)))) {
          if (copyIsArray) {
            copyIsArray = false;
            clone = (src && isArray(src)) ? src : [];
          } else {
            clone = (src && isPlainObject(src)) ? src : {};
          }
          setProperty(target, { name: name, newValue: extend(deep, clone, copy) });
        } else if (typeof copy !== 'undefined') {
          setProperty(target, { name: name, newValue: copy });
        }
      }
    }
  }

  return target;
}

export default extend;
