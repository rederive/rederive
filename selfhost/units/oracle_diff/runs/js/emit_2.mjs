const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ESCAPED = /\\u00([0-9a-f]{2})|\\u([0-9a-f]{4})/g;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const BITS = /^[0-9a-f]{16}$/;
const NAMES = { 0: 'NUL', 7: 'BEL', 9: '\\t', 10: '\\n', 13: '\\r', 27: 'ESC', 155: 'CSI' };
const ABSENT_MARK = '!absent';

const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isControl = (n) => n <= 0x1f || (n >= 0x7f && n <= 0x9f);
const label = (n) => '‹' + (NAMES[n] ?? 'U+' + n.toString(16).toUpperCase().padStart(4, '0')) + '›';

function nameControls(d) {
  d = d.replace(ESCAPED, (m, a, b) => {
    const n = parseInt(a ?? b, 16);
    return isControl(n) ? label(n) : m;
  });
  return d.replace(CONTROL, (c) => label(c.charCodeAt(0)));
}

function keyOf(v, depth = 0) {
  if (depth > 2000) return '!deep';
  if (v === null) return 'z';
  if (v === undefined) return 'u';
  if (typeof v === 'number') return 'n' + (Object.is(v, -0) ? '-0' : String(v));
  if (typeof v === 'string') return 's' + JSON.stringify(v);
  if (typeof v === 'boolean') return 'b' + v;
  if (Array.isArray(v)) return '[' + v.map((x) => keyOf(x, depth + 1)).join(',') + ']';
  return '{' + Object.keys(v).map((k) => JSON.stringify(k) + ':' + keyOf(v[k], depth + 1)).join(',') + '}';
}

const isNode = (x, t) => isMap(x) && own(x, 't') === t;

function canonical(x) {
  const st = [[x, 0]];
  while (st.length) {
    const [v, lv] = st.pop();
    if (v === undefined || v === null || typeof v === 'number') return false;
    if (lv > 416) return false;
    if (Array.isArray(v)) {
      for (const e of v) st.push([e, lv + 1]);
    } else if (isMap(v)) {
      if (isNode(v, 'f64')) {
        const b = own(v, 'bits');
        if (typeof b !== 'string' || !BITS.test(b)) return false;
        st.push([v.t, lv + 1], [b, lv + 1]);
      } else if (isNode(v, 'throw')) {
        st.push([v.t, lv + 1]);
      } else {
        for (const k of Object.keys(v)) st.push([v[k], lv + 1]);
      }
    }
  }
  return true;
}

function canonEqual(a, b) {
  if (typeof a === 'string') return typeof b === 'string' && a === b;
  if (typeof a === 'boolean') return typeof b === 'boolean' && a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!canonEqual(a[i], b[i])) return false;
    return true;
  }
  if (isMap(a)) {
    if (!isMap(b)) return false;
    if (isNode(a, 'f64')) return isNode(b, 'f64') && a.bits === b.bits;
    if (isNode(b, 'f64')) return false;
    if (isNode(a, 'throw')) return isNode(b, 'throw');
    if (isNode(b, 'throw')) return false;
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    for (const k of ka) {
      if (!Object.hasOwn(b, k)) return false;
      if (!canonEqual(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

function equal(x, y) {
  if (canonical(x) && canonical(y)) return canonEqual(x, y);
  return keyOf(x) === keyOf(y);
}

const textOf = (r) => String(r);
const field = (n) => {
  if (typeof n === 'string') return IDENT.test(n) ? n : JSON.stringify(n);
  if (n === undefined || n === null || typeof n === 'boolean' || typeof n === 'number') return String(n === undefined ? 'undefined' : n === null ? 'null' : typeof n === 'number' ? JSON.stringify(n) : n);
  return JSON.stringify(n);
};

function disp(x) {
  if (x === undefined || x === null) throw new Error('fail');
  if (!isMap(x)) return '?';
  const t = own(x, 't');
  const v = own(x, 'v');
  switch (typeof t === 'string' ? t : '') {
    case 'none': return 'null';
    case 'undefined': return 'undefined';
    case 'bool': return textOf(v);
    case 'bigint': return textOf(v) + 'n';
    case 'text': return JSON.stringify(v);
    case 'f64': case 'i64': case 'u64': case 'bytes': return v;
    case 'throw': {
      const m = own(x, 'msg');
      return 'throw(' + JSON.stringify(m === undefined || m === null ? '' : m) + ')';
    }
    case 'list': case 'tuple': {
      if (!Array.isArray(v)) throw new Error('fail');
      return '[' + v.map((e) => disp(e)).join(',') + ']';
    }
    case 'map': case 'record': {
      if (!Array.isArray(v)) throw new Error('fail');
      for (const e of v) if (e === null || typeof e === 'boolean' || typeof e === 'number' || isMap(e)) throw new Error('fail');
      if (t === 'map') return '{' + v.map((e) => textOf(disp(e[0])) + ':' + textOf(disp(e[1]))).join(',') + '}';
      return '{' + v.map((e) => field(e[0]) + ':' + textOf(disp(e[1]))).join(', ') + '}';
    }
    default: return '?';
  }
}

function shown(x) {
  try {
    let d;
    try { d = disp(x); } catch { d = '?'; }
    if (typeof d !== 'string' || d === '?') d = JSON.stringify(x) ?? 'undefined';
    return nameControls(d);
  } catch {
    return '?';
  }
}

function input(c) {
  if (Array.isArray(c.args)) return c.args.map(shown).join(', ');
  return '(args: ' + shown(c.args) + ')';
}

function readFile(text) {
  let p;
  try { p = JSON.parse(text); } catch { return { shape: 'unparseable', cases: [], file: Object.create(null) }; }
  const none = (shape) => ({ shape, cases: [], file: Object.create(null) });
  if (!isMap(p) || !Object.hasOwn(p, 'frozen') || !Object.hasOwn(p, 'heldout') || !Array.isArray(p.frozen) || !Array.isArray(p.heldout)) return none('unknown-shape');
  const st = [[p, 0]];
  while (st.length) {
    const [v, d] = st.pop();
    if (d > 2000) return none('too-deep');
    if (v !== null && typeof v === 'object') {
      const ks = Object.keys(v);
      if (ks.length && d >= 2000) return none('too-deep');
      for (const k of ks) {
        const c = v[k];
        if (c !== null && typeof c === 'object') st.push([c, d + 1]);
      }
    }
  }
  const file = Object.create(null);
  for (const k of Object.keys(p)) if (k !== 'frozen' && k !== 'heldout' && k !== 'canonicalSha256') file[k] = p[k];
  let shape = 'ok';
  const cases = [];
  const counts = new Map();
  const add = (el, hidden) => {
    if (!isMap(el)) { shape = 'malformed-cases'; return; }
    const has = Object.hasOwn(el, 'name');
    const id = JSON.stringify([has ? keyOf(el.name) : null, has]);
    const k = (counts.get(id) ?? 0) + 1;
    counts.set(id, k);
    let name = has ? (typeof el.name === 'string' ? el.name : JSON.stringify(el.name)) : '(no name)';
    if (k >= 2) name += ' (#' + k + ')';
    const other = Object.create(null);
    for (const key of Object.keys(el)) if (key !== 'name' && key !== 'args' && key !== 'expected') other[key] = el[key];
    cases.push({ key: JSON.stringify([id, k]), name, hidden, args: own(el, 'args'), expected: own(el, 'expected'), other });
  };
  for (const el of p.frozen) add(el, false);
  for (const el of p.heldout) add(el, true);
  return { shape, cases, file };
}

function changedKeys(x, y) {
  const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
  const kt = (m, k) => (Object.hasOwn(m, k) ? keyOf(m[k]) : ABSENT_MARK);
  return keys.filter((k) => kt(x, k) !== kt(y, k));
}

export function oracle_diff(before, after) {
  const B = readFile(before);
  const A = readFile(after);
  const bm = new Map(B.cases.map((c) => [c.key, c]));
  const am = new Map(A.cases.map((c) => [c.key, c]));
  const added = [], removed = [], rewritten = [], inputsChanged = [], moved = [], otherChanged = [];
  for (const c of A.cases) {
    const o = bm.get(c.key);
    if (!o) {
      added.push({ name: c.name, hidden: c.hidden, input: input(c), to: shown(c.expected) });
      continue;
    }
    const argsDiff = !equal(o.args, c.args);
    if (argsDiff) inputsChanged.push({ name: c.name, hidden: c.hidden, from: input(o), to: input(c) });
    if (!equal(o.expected, c.expected)) {
      rewritten.push({ name: c.name, hidden: c.hidden, input: input(c), from: shown(o.expected), to: shown(c.expected), inputChanged: argsDiff });
    }
    if (o.hidden !== c.hidden) moved.push({ name: c.name, from: o.hidden ? 'hidden' : 'visible', to: c.hidden ? 'hidden' : 'visible' });
    const ck = changedKeys(o.other, c.other);
    if (ck.length) otherChanged.push({ name: c.name, keys: ck });
  }
  for (const c of B.cases) {
    if (!am.has(c.key)) removed.push({ name: c.name, hidden: c.hidden, input: input(c), to: shown(c.expected) });
  }
  const fileChanged = changedKeys(B.file, A.file);
  const bc = B.cases.filter((c) => am.has(c.key)).map((c) => c.key);
  const ac = A.cases.filter((c) => bm.has(c.key)).map((c) => c.key);
  let reordered = bc.length !== ac.length;
  for (let i = 0; !reordered && i < bc.length; i++) if (bc[i] !== ac[i]) reordered = true;
  return { before: B.shape, after: A.shape, added, removed, rewritten, inputsChanged, moved, otherChanged, fileChanged, reordered };
}
