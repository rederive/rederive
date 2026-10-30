use serde_json::{json, Map, Value};

struct P<'a> {
    b: &'a [u8],
    i: usize,
}

fn bad() -> ! {
    panic!("bad SIG")
}

impl<'a> P<'a> {
    fn ws(&mut self) {
        while self.i < self.b.len() && matches!(self.b[self.i], b' ' | b'\t' | b'\r' | b'\n') {
            self.i += 1;
        }
    }
    fn eat(&mut self, t: &[u8]) -> bool {
        if self.b[self.i..].starts_with(t) {
            self.i += t.len();
            true
        } else {
            false
        }
    }
    fn expect(&mut self, t: &[u8]) {
        if !self.eat(t) {
            bad()
        }
    }
    fn ident(&mut self) -> String {
        let s = self.i;
        if self.i < self.b.len() && (self.b[self.i].is_ascii_alphabetic() || self.b[self.i] == b'_') {
            self.i += 1;
            while self.i < self.b.len() && (self.b[self.i].is_ascii_alphanumeric() || self.b[self.i] == b'_') {
                self.i += 1;
            }
        } else {
            bad()
        }
        String::from_utf8(self.b[s..self.i].to_vec()).unwrap()
    }
    fn ty(&mut self) -> Value {
        let mut alts = vec![self.alt()];
        loop {
            self.ws();
            if self.eat(b"|") {
                self.ws();
                alts.push(self.alt());
            } else {
                break;
            }
        }
        if alts.len() >= 2 {
            json!({"k": "union", "alts": alts})
        } else {
            alts.pop().unwrap()
        }
    }
    fn alt(&mut self) -> Value {
        self.ws();
        let name = self.ident();
        match name.as_str() {
            "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" => json!({"k": name}),
            "tuple" => {
                self.expect(b"[");
                let mut items = Vec::new();
                loop {
                    items.push(self.ty());
                    self.ws();
                    if self.eat(b",") {
                        continue;
                    }
                    self.expect(b"]");
                    break;
                }
                json!({"k": "tuple", "items": items})
            }
            "list" => {
                self.expect(b"[");
                let item = self.ty();
                self.ws();
                self.expect(b"]");
                json!({"k": "list", "item": item})
            }
            "map" => {
                self.expect(b"[");
                let key = self.ty();
                self.ws();
                self.expect(b",");
                let val = self.ty();
                self.ws();
                self.expect(b"]");
                json!({"k": "map", "key": key, "val": val})
            }
            "record" => {
                self.expect(b"[");
                let mut fields: Vec<Value> = Vec::new();
                let mut seen: Vec<String> = Vec::new();
                loop {
                    self.ws();
                    let n = self.ident();
                    if seen.contains(&n) {
                        bad()
                    }
                    self.ws();
                    self.expect(b":");
                    let t = self.ty();
                    seen.push(n.clone());
                    fields.push(json!([n, t]));
                    self.ws();
                    if self.eat(b",") {
                        continue;
                    }
                    self.expect(b"]");
                    break;
                }
                json!({"k": "record", "fields": fields})
            }
            _ => bad(),
        }
    }
}

pub fn parse_sig(s: &str) -> serde_json::Value {
    let mut p = P { b: s.as_bytes(), i: 0 };
    p.ws();
    for pre in [&b"pub fn"[..], &b"export default function"[..]] {
        if p.b[p.i..].starts_with(pre) {
            let n = p.b.get(p.i + pre.len()).copied();
            if n == Some(b' ') || n == Some(b'\t') {
                p.i += pre.len();
                break;
            }
        }
    }
    p.ws();
    let name = p.ident();
    p.ws();
    p.expect(b"(");
    p.ws();
    let mut args: Vec<Value> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    let mut rest_seen = false;
    if !p.eat(b")") {
        loop {
            p.ws();
            if rest_seen {
                bad()
            }
            let rest = p.eat(b"...");
            if rest {
                rest_seen = true;
                p.ws();
            }
            let n = p.ident();
            if seen.contains(&n) {
                bad()
            }
            p.ws();
            p.expect(b":");
            let t = p.ty();
            seen.push(n.clone());
            let mut m = Map::new();
            m.insert("name".into(), json!(n));
            m.insert("type".into(), t);
            if rest {
                m.insert("rest".into(), Value::Bool(true));
            }
            args.push(Value::Object(m));
            p.ws();
            if p.eat(b",") {
                continue;
            }
            p.expect(b")");
            break;
        }
    }
    p.ws();
    if !p.eat(b"->") {
        p.expect(b":");
    }
    let result = p.ty();
    p.ws();
    if p.i != p.b.len() {
        bad()
    }
    json!({"name": name, "args": args, "result": result})
}
