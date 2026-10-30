use serde_json::{json, Map, Value};

struct P<'a> {
    b: &'a [u8],
    i: usize,
}

fn bad(m: &str, at: usize) -> ! {
    panic!("bad SIG: {} at {}", m, at)
}

impl<'a> P<'a> {
    fn ws(&mut self) {
        while self.i < self.b.len() && matches!(self.b[self.i], b' ' | b'\t' | b'\r' | b'\n') {
            self.i += 1;
        }
    }
    fn lit(&mut self, t: &[u8]) -> bool {
        if self.b[self.i..].starts_with(t) {
            self.i += t.len();
            true
        } else {
            false
        }
    }
    fn expect(&mut self, t: &str) {
        if !self.lit(t.as_bytes()) {
            bad(&format!("expected '{}'", t), self.i);
        }
    }
    fn ident(&mut self) -> String {
        let s = self.i;
        if s < self.b.len() && (self.b[s].is_ascii_alphabetic() || self.b[s] == b'_') {
            let mut j = s + 1;
            while j < self.b.len() && (self.b[j].is_ascii_alphanumeric() || self.b[j] == b'_') {
                j += 1;
            }
            self.i = j;
            String::from_utf8_lossy(&self.b[s..j]).into_owned()
        } else {
            bad("expected an identifier", s)
        }
    }
    fn ty(&mut self) -> Value {
        let mut alts = vec![self.alt()];
        loop {
            self.ws();
            if self.lit(b"|") {
                self.ws();
                alts.push(self.alt());
            } else {
                break;
            }
        }
        if alts.len() == 1 {
            alts.pop().unwrap()
        } else {
            json!({"k": "union", "alts": alts})
        }
    }
    fn alt(&mut self) -> Value {
        let at = self.i;
        let id = self.ident();
        match id.as_str() {
            "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" => {
                json!({ "k": id })
            }
            "tuple" => {
                self.expect("[");
                let mut items = vec![];
                loop {
                    self.ws();
                    items.push(self.ty());
                    self.ws();
                    if !self.lit(b",") {
                        break;
                    }
                }
                self.expect("]");
                json!({"k": "tuple", "items": items})
            }
            "list" => {
                self.expect("[");
                self.ws();
                let t = self.ty();
                self.ws();
                self.expect("]");
                json!({"k": "list", "item": t})
            }
            "map" => {
                self.expect("[");
                self.ws();
                let k = self.ty();
                self.ws();
                self.expect(",");
                self.ws();
                let v = self.ty();
                self.ws();
                self.expect("]");
                json!({"k": "map", "key": k, "val": v})
            }
            "record" => {
                self.expect("[");
                let mut fields: Vec<Value> = vec![];
                let mut names: Vec<String> = vec![];
                loop {
                    self.ws();
                    let n = self.ident();
                    if names.contains(&n) {
                        bad("duplicate field", self.i);
                    }
                    self.ws();
                    self.expect(":");
                    self.ws();
                    let t = self.ty();
                    fields.push(json!([n.clone(), t]));
                    names.push(n);
                    self.ws();
                    if !self.lit(b",") {
                        break;
                    }
                }
                self.expect("]");
                json!({"k": "record", "fields": fields})
            }
            _ => bad("expected a type", at),
        }
    }
}

pub fn parse_sig(s: &str) -> serde_json::Value {
    let mut p = P { b: s.as_bytes(), i: 0 };
    p.ws();
    for pre in [&b"pub fn"[..], &b"export default function"[..]] {
        if p.b[p.i..].starts_with(pre) {
            let n = p.i + pre.len();
            if n < p.b.len() && (p.b[n] == b' ' || p.b[n] == b'\t') {
                p.i = n + 1;
                p.ws();
                break;
            }
        }
    }
    let name = p.ident();
    p.ws();
    p.expect("(");
    p.ws();
    let mut args: Vec<Value> = vec![];
    let mut names: Vec<String> = vec![];
    let mut rest_seen = false;
    if !p.lit(b")") {
        loop {
            p.ws();
            if rest_seen {
                bad("rest parameter must be last", p.i);
            }
            let rest = p.lit(b"...");
            p.ws();
            let n = p.ident();
            if names.contains(&n) {
                bad("duplicate parameter", p.i);
            }
            p.ws();
            p.expect(":");
            p.ws();
            let t = p.ty();
            let mut m = Map::new();
            m.insert("name".into(), Value::String(n.clone()));
            m.insert("type".into(), t);
            if rest {
                m.insert("rest".into(), Value::Bool(true));
                rest_seen = true;
            }
            names.push(n);
            args.push(Value::Object(m));
            p.ws();
            if p.lit(b",") {
                continue;
            }
            p.expect(")");
            break;
        }
    }
    p.ws();
    if !p.lit(b"->") && !p.lit(b":") {
        bad("expected '->' or ':'", p.i);
    }
    p.ws();
    let result = p.ty();
    p.ws();
    if p.i != p.b.len() {
        bad("trailing input", p.i);
    }
    json!({"name": name, "args": args, "result": result})
}
