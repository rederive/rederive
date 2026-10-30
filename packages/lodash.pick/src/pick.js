// @rederive/pick — verified-recompose of lodash.pick@4.4.0. quorum 3/3, differential 400/400, round 2. SIR: sir/pick.sir
// Clean-room re-emission of lodash.pick@4.4.0
// Reconstructed strictly from pick.sir + frozen.md — no original source consulted.

// ---------------------------------------------------------------------------
// isSymbol helper
// ---------------------------------------------------------------------------
function isSymbol(value) {
  return typeof value === 'symbol' ||
    (value !== null && typeof value === 'object' &&
      Object.prototype.toString.call(value) === '[object Symbol]');
}

// ---------------------------------------------------------------------------
// toKey — NODE 4 key normalization (exact SIR rule)
// ---------------------------------------------------------------------------
function toKey(value) {
  // Strings and Symbols pass through unchanged
  if (typeof value === 'string' || isSymbol(value)) {
    return value;
  }
  // String coercion (same as String(value) / value + '')
  var result = (value + '');
  // The zero rule: only when coercion yields "0", distinguish +0 from -0.
  // NOTE: 1/-0 === -Infinity (primitive number -0 only).
  // For BigInt 0n: result === '0' is true, then 1 / 0n throws TypeError
  // (mixing BigInt and Number) — we must NOT catch this; let it propagate.
  if (result === '0' && (1 / value) === -Infinity) {
    return '-0';
  }
  return result;
}

// ---------------------------------------------------------------------------
// isLength helper (used by isFlattenable / isArguments)
// ---------------------------------------------------------------------------
var MAX_SAFE_INTEGER = 9007199254740991;

function isLength(value) {
  return typeof value === 'number' &&
    value > -1 &&
    value % 1 === 0 &&
    value <= MAX_SAFE_INTEGER;
}

// ---------------------------------------------------------------------------
// isArguments helper
// ---------------------------------------------------------------------------
function isArguments(value) {
  // Check [object Arguments] tag
  return Object.prototype.toString.call(value) === '[object Arguments]';
}

// ---------------------------------------------------------------------------
// isFlattenable helper — TRUE for Array, arguments objects, or isConcatSpreadable
// ---------------------------------------------------------------------------
function isFlattenable(value) {
  return Array.isArray(value) ||
    isArguments(value) ||
    !!(value && value[Symbol.isConcatSpreadable]);
}

// ---------------------------------------------------------------------------
// baseFlatten — depth-1 flatten (SIR NODE 3)
// ---------------------------------------------------------------------------
function baseFlatten(array, depth) {
  var result = [];
  for (var i = 0; i < array.length; i++) {
    var value = array[i];
    if (depth > 0 && isFlattenable(value)) {
      // Depth 1: only spread one level (iterate, but don't recurse)
      if (depth > 1) {
        // Recursive flatten for deeper nesting (not needed for depth=1 in pick,
        // but implement faithfully so behavior matches for depth=1 case exactly)
        var inner = baseFlatten(value, depth - 1);
        for (var j = 0; j < inner.length; j++) {
          result.push(inner[j]);
        }
      } else {
        // depth === 1: spread the elements without further recursion
        for (var k = 0; k < value.length; k++) {
          result.push(value[k]);
        }
      }
    } else {
      result.push(value);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// basePick — NODE 5 + NODE 6 (box + select by `key in object`)
// ---------------------------------------------------------------------------
function basePick(object, keys) {
  // Box the object (primitives become their wrapper objects)
  var obj = Object(object);
  var result = {};
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    // ECMAScript `in` operator: own OR inherited
    if (key in obj) {
      // Assignment: for '__proto__' this invokes the setter and creates no own key
      result[key] = obj[key];
    }
    // Missing keys are silently omitted
  }
  return result;
}

// ---------------------------------------------------------------------------
// pick — the main export (NODE 1..6 pipeline)
// ---------------------------------------------------------------------------
function pick(object) {
  // NODE 1: variadic rest — gather all arguments from index 1 onward
  var props = [];
  for (var i = 1; i < arguments.length; i++) {
    props.push(arguments[i]);
  }

  // NODE 2: null/undefined guard
  if (object == null) {
    return {};
  }

  // NODE 3: flatten props one level
  var flat = baseFlatten(props, 1);

  // NODE 4: normalize each key via toKey (may throw for 0n)
  var keys = flat.map(toKey);

  // NODE 5 + 6: box object, select keys, shallow copy
  return basePick(object, keys);
}

export default pick;
