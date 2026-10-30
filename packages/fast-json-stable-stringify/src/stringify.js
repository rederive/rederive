// @rederive/stringify — verified-recompose of fast-json-stable-stringify@2.1.0. quorum 3/3, differential 400/400, round 1. SIR: sir/stringify.sir
function stringify(data, opts) {
  // N1: falsy opts -> {}
  if (!opts) opts = {};
  // N2: function shorthand
  if (typeof opts === 'function') opts = { cmp: opts };
  // N3: cycles — only a real boolean enables/disables
  var cycles = (typeof opts.cycles === 'boolean') ? opts.cycles : false;
  // N4: cmp comparator factory
  var cmp = opts.cmp
    ? function (node) {
        return function (a, b) {
          return opts.cmp({ key: a, value: node[a] }, { key: b, value: node[b] });
        };
      }
    : undefined;
  // N5: seen stack (objects only)
  var seen = [];

  return (function _stringify(node) {
    // node-1: toJSON coercion (FIRST, on every node)
    if (node && node.toJSON && typeof node.toJSON === 'function') {
      node = node.toJSON();
    }

    // node-2: undefined -> return undefined (JS value)
    if (node === undefined) return undefined;

    // node-3: number
    if (typeof node === 'number') {
      return isFinite(node) ? ('' + node) : 'null';
    }

    // node-3a: non-object, non-number scalars (string, boolean, bigint, symbol, function)
    if (typeof node !== 'object') {
      return JSON.stringify(node);
    }

    // node-5b: null (typeof null === 'object', not an array)
    // Check array first per the SIR ordering: array -> null -> plain object
    // node-5: array
    if (Array.isArray(node)) {
      var out = '[';
      for (var i = 0; i < node.length; i++) {
        if (i) out += ',';
        out += (_stringify(node[i]) || 'null');
      }
      return out + ']';
    }

    // node-5b: null
    if (node === null) return 'null';

    // node-6: plain object (non-null, non-array)
    // cycle check
    if (seen.indexOf(node) !== -1) {
      if (cycles) return JSON.stringify('__cycle__');
      else throw new TypeError('Converting circular structure to JSON');
    }
    var seenIndex = seen.push(node) - 1;

    var keys = Object.keys(node).sort(cmp && cmp(node));
    var out = '';
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value = _stringify(node[key]);
      if (!value) continue; // omit key if value is falsy string (undefined)
      if (out) out += ',';
      out += JSON.stringify(key) + ':' + value;
    }

    seen.splice(seenIndex, 1);
    return '{' + out + '}';
  }(data));
}

export default stringify;
