// @rederive/flatten — verified-recompose of flat@5.0.2. quorum 3/3, differential 400/400, round 1. SIR: sir/flatten.sir
export default function flatten(target, opts) {
  opts = opts || {};

  var delimiter = opts.delimiter || '.';
  var maxDepth = opts.maxDepth;
  var transformKey = opts.transformKey || function(key) { return key; };
  var output = {};

  function isBuffer(value) {
    return value &&
      value.constructor &&
      typeof value.constructor.isBuffer === 'function' &&
      value.constructor.isBuffer(value);
  }

  function step(object, prev, currentDepth) {
    currentDepth = currentDepth || 1;

    var keys = Object.keys(object);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value = object[key];
      var isarray = opts.safe && Array.isArray(value);
      var type = Object.prototype.toString.call(value);
      var isbuffer = isBuffer(value);
      var isobject = (type === '[object Object]') || (type === '[object Array]');

      var newKey = prev ? (prev + delimiter + transformKey(key)) : transformKey(key);

      var shouldRecurse = !isarray &&
        !isbuffer &&
        isobject &&
        Object.keys(value).length &&
        (!opts.maxDepth || currentDepth < maxDepth);

      if (shouldRecurse) {
        step(value, newKey, currentDepth + 1);
      } else {
        output[newKey] = value;
      }
    }
  }

  step(target);

  return output;
}
