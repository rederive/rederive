use serde_json::{json, Map, Value};

const MAX_DEPTH: usize = 256;
const SCALARS: [&str; 8] = ["text", "bytes", "bool", "none", "i64", "u64", "f64", "json"];

struct R<'a> {
    b: &'a [u8],
    i: usize,
}

fn bad(msg: &str) -> ! {
    panic!("bad SIG: {}", msg)
}

impl<'a> R<'a> {
    fn ws(&mut self) {
        while self.i < self.b.len() && matches!(self.b[self.i], b' ' | b'\t' | b'\r' | b'\n') {
            self.i += 1;
        }
    }
    fn is_start(c: u8) -> bool {
        c.is_ascii_alphabetic() || c == b'_'
    }
    fn ident_opt(&mut self) -> Option<String> {
        self.ws();
        if self.i >= self.b.len() || !Self::is_start(self.b[self.i]) {
            return None;
        }
        let st = self.i;
        while self.i < self.b.len() && (self.b[self.i].is_ascii_alphanumeric() || self.b[self.i] == b'_') {
            self.i += 1;
        }
        Some(String::from_utf8_lossy(&self.b[st..self.i]).into_owned())
    }
    fn ident(&mut self) -> String {
        match self.ident_opt() {
            Some(s) => s,
            None => bad("expected an identifier"),
        }
    }
    fn lit(&mut self, l: &[u8]) -> bool {
        self.ws();
        if self.b[self.i..].starts_with(l) {
            self.i += l.len();
            true
        } else {
            false
        }
    }
    fn expect(&mut self, l: &[u8]) {
        if !self.lit(l) {
            bad("expected literal");
        }
    }
    fn prefix(&mut self) {
        for words in [&["pub", "fn"][..], &["export", "default", "function"][..]] {
            let save = self.i;
            let mut ok = true;
            for w in words {
                match self.ident_opt() {
                    Some(s) if s == *w => {}
                    _ => {
                        ok = false;
                        break;
                    }
                }
            }
            if ok {
                self.ws();
                if self.i < self.b.len() && Self::is_start(self.b[self.i]) {
                    return;
                }
            }
            self.i = save;
        }
    }
    fn typ(&mut self, depth: usize) -> Value {
        let mut alts: Vec<Value> = Vec::new();
        loop {
            let a = self.alt(depth);
            if alts.contains(&a) {
                bad("duplicate alternative");
            }
            alts.push(a);
            if !self.lit(b"|") {
                break;
            }
        }
        if alts.len() == 1 {
            alts.pop().unwrap()
        } else {
            json!({"k": "union", "alts": alts})
        }
    }
    fn alt(&mut self, depth: usize) -> Value {
        let id = self.ident();
        match id.as_str() {
            "tuple" | "list" | "map" | "record" => {
                if depth + 1 > MAX_DEPTH {
                    bad("nesting too deep");
                }
                let d = depth + 1;
                self.expect(b"[");
                let v = match id.as_str() {
                    "tuple" => {
                        let mut items = vec![self.typ(d)];
                        while self.lit(b",") {
                            items.push(self.typ(d));
                        }
                        json!({"k": "tuple", "items": items})
                    }
                    "list" => {
                        let item = self.typ(d);
                        json!({"k": "list", "item": item})
                    }
                    "map" => {
                        let key = self.typ(d);
                        self.expect(b",");
                        let val = self.typ(d);
                        json!({"k": "map", "key": key, "val": val})
                    }
                    _ => {
                        let mut names: Vec<String> = Vec::new();
                        let mut fields: Vec<Value> = Vec::new();
                        loop {
                            let n = self.ident();
                            if names.contains(&n) {
                                bad("duplicate field name");
                            }
                            self.expect(b":");
                            let t = self.typ(d);
                            names.push(n.clone());
                            fields.push(json!([n, t]));
                            if !self.lit(b",") {
                                break;
                            }
                        }
                        json!({"k": "record", "fields": fields})
                    }
                };
                self.expect(b"]");
                v
            }
            s if SCALARS.contains(&s) => json!({"k": s}),
            _ => bad("unknown type"),
        }
    }
}

pub fn parse_sig(s: &str) -> Value {
    let mut r = R { b: s.as_bytes(), i: 0 };
    r.prefix();
    let name = r.ident();
    r.expect(b"(");
    let mut args: Vec<Value> = Vec::new();
    let mut names: Vec<String> = Vec::new();
    let mut rest_seen = false;
    r.ws();
    if !r.lit(b")") {
        loop {
            if rest_seen {
                bad("a rest parameter must be last");
            }
            let rest = r.lit(b"...");
            let n = r.ident();
            if names.contains(&n) {
                bad("duplicate parameter name");
            }
            r.expect(b":");
            let t = r.typ(0);
            names.push(n.clone());
            let mut m = Map::new();
            m.insert("name".into(), Value::String(n));
            m.insert("type".into(), t);
            if rest {
                m.insert("rest".into(), Value::Bool(true));
                rest_seen = true;
            }
            args.push(Value::Object(m));
            if !r.lit(b",") {
                break;
            }
        }
        r.expect(b")");
    }
    if !(r.lit(b"->") || r.lit(b":")) {
        bad("expected '->' or ':' before the result type");
    }
    let result = r.typ(0);
    r.ws();
    if r.i != r.b.len() {
        bad("unexpected trailing text");
    }
    json!({"name": name, "args": args, "result": result})
}
