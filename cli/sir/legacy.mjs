// Promoted from sir-lab/v05-lang lib/legacy.mjs (#164): the js ENVELOPE EXTENSION oracle is graded by rdv too, so its codec lives here.
// Decode the v0.4 codec tags (sir-factory/lib/codec.mjs) to native JS values — used ONLY for a language's envelope-extension
// oracle (vectors whose values have no language-neutral meaning: boxed wrappers, plain objects, bigint, undefined...).
export function decodeLegacy(v) {
  if (Array.isArray(v)) return v.map(decodeLegacy);
  if (v && typeof v === 'object') {
    if (typeof v.__t === 'string') switch (v.__t) {
      case 'undef': return undefined;
      case 'num': if (!['NaN', 'Infinity', '-Infinity', '-0'].includes(v.v)) throw new Error(`legacy num tag: ${JSON.stringify(v.v)} — the codec writes only NaN, Infinity, -Infinity, -0 (rederive selfhost #55)`); return Number(v.v);
      case 'bigint': return BigInt(v.v);
      case 'boxed': return v.k === 'Number' ? new Number(v.v) : v.k === 'String' ? new String(v.v) : v.k === 'Boolean' ? new Boolean(v.v) : v.v;
      case 'regex': return new RegExp(v.source, v.flags);
      case 'set': return new Set(v.values.map(decodeLegacy));
      case 'map': return new Map(v.entries.map(([k, x]) => [decodeLegacy(k), decodeLegacy(x)]));
      case 'u8': return v.buf ? Buffer.from(v.bytes) : Uint8Array.from(v.bytes);   // buf:true = a Node Buffer (a Uint8Array subclass the package tells apart)
      case 'obj': { if (v.v === null || typeof v.v !== 'object' || Array.isArray(v.v)) throw new Error('legacy obj tag: v must be a plain map (rederive selfhost #55)'); const o = {}; for (const k of Object.keys(v.v)) Object.defineProperty(o, k, { value: decodeLegacy(v.v[k]), enumerable: true, writable: true, configurable: true }); return o; }
      case 'sparse': { const a = new Array(v.length); for (const [i, x] of v.entries) a[i] = decodeLegacy(x); return a; }
      default: throw new Error('unknown legacy tag ' + v.__t);
    }
    { const o = {}; for (const k of Object.keys(v)) Object.defineProperty(o, k, { value: decodeLegacy(v[k]), enumerable: true, writable: true, configurable: true }); return o; }
  }
  return v;
}

// ENCODE to the same v0.4 tags (mirror of sir-factory/lib/codec.mjs encode) — used ONLY to write a language extension's `post`
// observation for a STATE unit; the language-neutral oracle never uses it.
export function encodeLegacy(v) {
  if (v === undefined) return { __t: 'undef' };
  if (typeof v === 'bigint') return { __t: 'bigint', v: v.toString() };
  if (Object.is(v, -0)) return { __t: 'num', v: '-0' };
  if (typeof v === 'number' && !Number.isFinite(v)) return { __t: 'num', v: String(v) };
  if (v instanceof RegExp) return { __t: 'regex', source: v.source, flags: v.flags };
  if (v instanceof Number || v instanceof String || v instanceof Boolean) return { __t: 'boxed', k: v.constructor.name, v: encodeLegacy(v.valueOf()) };
  if (v instanceof Set) return { __t: 'set', values: [...v].map(encodeLegacy) };
  if (v instanceof Map) return { __t: 'map', entries: [...v].map(([k, x]) => [encodeLegacy(k), encodeLegacy(x)]) };
  if (v instanceof Uint8Array) return { __t: 'u8', bytes: Array.from(v), buf: typeof Buffer !== 'undefined' && Buffer.isBuffer(v) };
  if (Array.isArray(v)) { let sparse = false; for (let i = 0; i < v.length; i++) if (!(i in v)) { sparse = true; break; } if (!sparse) return v.map(encodeLegacy); const entries = []; for (let i = 0; i < v.length; i++) if (i in v) entries.push([i, encodeLegacy(v[i])]); return { __t: 'sparse', length: v.length, entries }; }
// own keys only (an own "__proto__" is a key, never the prototype); a map that carries a codec marker key (__t / __throw /
// __threw) is ESCAPED as {__t:'obj', v} so it can never read as a tag or a throw (rederive selfhost Tier 1 #18 #26 #31)
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) { if (typeof v[k] === 'function') continue; Object.defineProperty(o, k, { value: encodeLegacy(v[k]), enumerable: true, writable: true, configurable: true }); } return (Object.hasOwn(v, '__t') || Object.hasOwn(v, '__throw') || Object.hasOwn(v, '__threw')) ? { __t: 'obj', v: o } : o; /* OWN marker keys only (rederive selfhost #67) */ }
  return v;
}
