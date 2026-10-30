const SCALARS = new Set(["text", "bytes", "bool", "none", "i64", "u64", "f64", "json"]);
const COMPOSITE = new Set(["tuple", "list", "map", "record"]);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

export default function parse_sig(s) {
  let i = 0;
  const fail = (m) => { throw new Error("bad SIG: " + m + " at " + i); };
  const ws = () => { while (i < s.length && (s[i] === " " || s[i] === "\t" || s[i] === "\r" || s[i] === "\n")) i++; };
  const ident = () => {
    ws();
    const m = IDENT.exec(s.slice(i));
    if (!m) fail("expected an identifier");
    i += m[0].length;
    return m[0];
  };
  const expect = (t) => {
    ws();
    if (!s.startsWith(t, i)) fail("expected '" + t + "'");
    i += t.length;
  };
  const type = () => {
    const alts = [alt()];
    for (;;) {
      ws();
      if (s[i] === "|") { i++; alts.push(alt()); } else break;
    }
    return alts.length > 1 ? { k: "union", alts } : alts[0];
  };
  const alt = () => {
    const w = ident();
    if (SCALARS.has(w)) return { k: w };
    if (!COMPOSITE.has(w)) fail("unknown type");
    if (s[i] !== "[") fail("expected '['");
    i++;
    let r;
    if (w === "list") {
      r = { k: "list", item: type() };
    } else if (w === "map") {
      const key = type();
      expect(",");
      r = { k: "map", key, val: type() };
    } else if (w === "tuple") {
      const items = [type()];
      for (;;) {
        ws();
        if (s[i] === ",") { i++; items.push(type()); } else break;
      }
      r = { k: "tuple", items };
    } else {
      const fields = [];
      const seen = new Set();
      for (;;) {
        const n = ident();
        if (seen.has(n)) fail("duplicate field");
        seen.add(n);
        expect(":");
        fields.push([n, type()]);
        ws();
        if (s[i] === ",") i++; else break;
      }
      r = { k: "record", fields };
    }
    expect("]");
    return r;
  };

  ws();
  for (const p of ["pub fn", "export default function"]) {
    if (s.startsWith(p, i) && (s[i + p.length] === " " || s[i + p.length] === "\t")) {
      i += p.length + 1;
      break;
    }
  }
  const name = ident();
  expect("(");
  const args = [];
  const names = new Set();
  ws();
  if (s[i] === ")") {
    i++;
  } else {
    for (;;) {
      ws();
      let rest = false;
      if (s.startsWith("...", i)) { rest = true; i += 3; }
      const n = ident();
      if (names.has(n)) fail("duplicate param");
      names.add(n);
      expect(":");
      const a = { name: n, type: type() };
      if (rest) a.rest = true;
      args.push(a);
      ws();
      if (s[i] === ",") { i++; continue; }
      expect(")");
      break;
    }
  }
  for (let j = 0; j < args.length - 1; j++) if (args[j].rest) fail("rest not last");
  ws();
  if (s.startsWith("->", i)) i += 2;
  else if (s[i] === ":") i++;
  else fail("expected '->'");
  const result = type();
  ws();
  if (i !== s.length) fail("trailing text");
  return { name, args, result };
}
