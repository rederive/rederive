// @rederive/dequal — verified-recompose of dequal@2.0.3. quorum 3/3, differential 400/400, round 1. SIR: sir/dequal.sir
// Clean-room re-emission of dequal@2.0.3 behavior from SIR contract.
// Emitter #3 of 3. Zero external dependencies.

var has = Object.prototype.hasOwnProperty;

function find(iter, tar) {
  for (var key of iter.keys()) {
    if (dequal(key, tar)) return key;
  }
}

export function dequal(foo, bar) {
  var ctor, len, tmp;

  // NODE 1 — identity short-circuit
  if (foo === bar) return true;

  // NODE 2 — truthy-object gate + constructor-identity check
  if (foo && bar && (ctor = foo.constructor) === bar.constructor) {

    // NODE 3 — Date (spec-only; implement per contract)
    if (ctor === Date) return foo.getTime() === bar.getTime();

    // NODE 4 — RegExp
    if (ctor === RegExp) return foo.toString() === bar.toString();

    // NODE 5 — Array
    if (ctor === Array) {
      if ((len = foo.length) === bar.length) {
        while (len-- && dequal(foo[len], bar[len]));
      }
      return len === -1;
    }

    // NODE 6 — Set
    if (ctor === Set) {
      if (foo.size !== bar.size) return false;
      for (len of foo) {
        tmp = len;
        if (tmp && typeof tmp === 'object') {
          tmp = find(bar, tmp);
          if (!tmp) return false;
        }
        if (!bar.has(tmp)) return false;
      }
      return true;
    }

    // NODE 7 — Map
    if (ctor === Map) {
      if (foo.size !== bar.size) return false;
      for (len of foo) {
        tmp = len[0];
        if (tmp && typeof tmp === 'object') {
          tmp = find(bar, tmp);
          if (!tmp) return false;
        }
        if (!dequal(len[1], bar.get(tmp))) return false;
      }
      return true;
    }

    // NODE 8 — ArrayBuffer / DataView / typed-array / plain object
    if (ctor === ArrayBuffer) {
      foo = new Uint8Array(foo);
      bar = new Uint8Array(bar);
    } else if (ctor === DataView) {
      if ((len = foo.byteLength) === bar.byteLength) {
        while (len-- && foo.getInt8(len) === bar.getInt8(len));
      }
      return len === -1;
    }

    if (ArrayBuffer.isView(foo)) {
      if ((len = foo.byteLength) === bar.byteLength) {
        while (len-- && foo[len] === bar[len]);
      }
      return len === -1;
    }

    if (!ctor || typeof foo === 'object') {
      len = 0;
      for (ctor in foo) {
        if (has.call(foo, ctor) && ++len && !has.call(bar, ctor)) return false;
        if (!(ctor in bar) || !dequal(foo[ctor], bar[ctor])) return false;
      }
      return Object.keys(bar).length === len;
    }
  }

  // NODE 9 — NaN tail
  return foo !== foo && bar !== bar;
}
