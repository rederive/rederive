const SCALARS = new Set(["text", "bytes", "bool", "none", "i64", "u64", "f64", "json"]);
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
  const eat = (t) => {
    ws();
    if (!s.startsWith(t, i)) fail("expected '" + t + "'");
    i += t.length;
  };
  const peek = (t) => { ws(); return s.startsWith(t, i); };

  const alt = () => {
    const w = ident();
    if (w === "tuple" || w === "list" || w === "map" || w === "record") {
      if (s[i] !== "[") fail("expected '['");
      i++;
      if (w === "tuple") {
        const items = [type()];
        while (peek(",")) { i++; items.push(type()); }
        eat("]");
        return { k: "tuple", items };
      }
      if (w === "list") {
        const item = type();
        eat("]");
        return { k: "list", item };
      }
      if (w === "map") {
        const key = type();
        eat(",");
        const val = type();
        eat("]");
        return { k: "map", key, val };
      }
      const fields = [];
      const seen = new Set();
      for (;;) {
        const n = ident();
        if (seen.has(n)) fail("duplicate field");
        seen.add(n);
        eat(":");
        fields.push([n, type()]);
        if (peek(",")) { i++; continue; }
        break;
      }
      eat("]");
      return { k: "record", fields };
    }
    if (SCALARS.has(w)) return { k: w };
    fail("unknown type");
  };
  const type = () => {
    const alts = [alt()];
    while (peek("|")) { i++; alts.push(alt()); }
    return alts.length > 1 ? { k: "union", alts } : alts[0];
  };

  ws();
  for (const p of ["pub fn", "export default function"]) {
    if (s.startsWith(p, i) && (s[i + p.length] === " " || s[i + p.length] === "\t")) {
      i += p.length + 1;
      break;
    }
  }
  const name = ident();
  eat("(");
  const args = [];
  const names = new Set();
  let sawRest = false;
  if (!peek(")")) {
    for (;;) {
      if (sawRest) fail("rest parameter must be last");
      let rest = false;
      if (peek("...")) { i += 3; rest = true; sawRest = true; }
      const n = ident();
      if (names.has(n)) fail("duplicate parameter");
      names.add(n);
      eat(":");
      const t = type();
      const a = { name: n, type: t };
      if (rest) a.rest = true;
      args.push(a);
      if (peek(",")) { i++; continue; }
      break;
    }
  }
  eat(")");
  ws();
  if (s.startsWith("->", i)) i += 2;
  else if (s[i] === ":") i++;
  else fail("expected '->' or ':'");
  const result = type();
  ws();
  if (i !== s.length) fail("trailing text");
  return { name, args, result };
}
