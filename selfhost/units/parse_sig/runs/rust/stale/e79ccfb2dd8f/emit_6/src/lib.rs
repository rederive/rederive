use serde_json::{json, Map, Value};

const SCALARS: [&str; 8] = ["text", "bytes", "bool", "none", "i64", "u64", "f64", "json"];

struct P<'a> {
    b: &'a [u8],
    i: usize,
}

fn bad(m: &str) -> ! {
    panic!("bad SIG: {}", m)
}

impl<'a> P<'a> {
    fn ws(&mut self) {
        while self.i < self.b.len() && matches!(self.b[self.i], b' ' | b'\t' | b'\r' | b'\n') {
            self.i += 1;
        }
    }

    fn ident_start(&self) -> bool {
        self.i < self.b.len() && (self.b[self.i].is_ascii_alphabetic() || self.b[self.i] == b'_')
    }

    fn ident(&mut self) -> &'a str {
        self.ws();
        if !self.ident_start() {
            bad("expected an identifier");
        }
        let st = self.i;
        while self.i < self.b.len() && (self.b[self.i].is_ascii_alphanumeric() || self.b[self.i] == b'_') {
            self.i += 1;
        }
        std::str::from_utf8(&self.b[st..self.i]).unwrap()
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
            bad("expected a token");
        }
    }

    fn prefix(&mut self) {
        let save = self.i;
        let words: [&[&str]; 2] = [&["pub", "fn"], &["export", "default", "function"]];
        for w in words.iter() {
            self.i = save;
            let mut ok = true;
            for x in w.iter() {
                self.ws();
                if !self.ident_start() {
                    ok = false;
                    break;
                }
                let st = self.i;
                while self.i < self.b.len() && (self.b[self.i].is_ascii_alphanumeric() || self.b[self.i] == b'_') {
                    self.i += 1;
                }
                if &self.b[st..self.i] != x.as_bytes() {
                    ok = false;
                    break;
                }
            }
            if ok {
                self.ws();
                if self.ident_start() {
                    return;
                }
            }
        }
        self.i = save;
    }

    fn ty(&mut self, depth: usize) -> Value {
        let mut alts: Vec<Value> = Vec::new();
        loop {
            let a = self.alt(depth);
            if alts.iter().any(|x| *x == a) {
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
        if SCALARS.contains(&id) {
            return json!({"k": id});
        }
        if !matches!(id, "tuple" | "list" | "map" | "record") {
            bad("unknown type");
        }
        let d = depth + 1;
        if d > 256 {
            bad("nesting too deep");
        }
        self.expect(b"[");
        let v = match id {
            "list" => {
                let t = self.ty(d);
                json!({"k": "list", "item": t})
            }
            "map" => {
                let k = self.ty(d);
                self.expect(b",");
                let v = self.ty(d);
                json!({"k": "map", "key": k, "val": v})
            }
            "tuple" => {
                let mut items = vec![self.ty(d)];
                while self.lit(b",") {
                    items.push(self.ty(d));
                }
                json!({"k": "tuple", "items": items})
            }
            _ => {
                let mut names: Vec<&str> = Vec::new();
                let mut fields: Vec<Value> = Vec::new();
                loop {
                    let n = self.ident();
                    if names.contains(&n) {
                        bad("duplicate field name");
                    }
                    names.push(n);
                    self.expect(b":");
                    let t = self.ty(d);
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
}

pub fn parse_sig(s: &str) -> Value {
    let mut p = P { b: s.as_bytes(), i: 0 };
    p.prefix();
    let name = p.ident();
    p.expect(b"(");
    let mut args: Vec<Value> = Vec::new();
    let mut names: Vec<&str> = Vec::new();
    let mut rests: Vec<bool> = Vec::new();
    if !p.lit(b")") {
        loop {
            let rest = p.lit(b"...");
            let n = p.ident();
            if names.contains(&n) {
                bad("duplicate parameter name");
            }
            names.push(n);
            p.expect(b":");
            let t = p.ty(0);
            let mut m = Map::new();
            m.insert("name".to_string(), json!(n));
            m.insert("type".to_string(), t);
            if rest {
                m.insert("rest".to_string(), Value::Bool(true));
            }
            rests.push(rest);
            args.push(Value::Object(m));
            if p.lit(b",") {
                continue;
            }
            p.expect(b")");
            break;
        }
    }
    if let Some(pos) = rests.iter().position(|r| *r) {
        if pos + 1 != rests.len() {
            bad("a rest parameter must be last");
        }
    }
    if !(p.lit(b"->") || p.lit(b":")) {
        bad("expected '->' or ':' before the result type");
    }
    let result = p.ty(0);
    p.ws();
    if p.i != p.b.len() {
        bad("trailing text");
    }
    json!({"name": name, "args": args, "result": result})
}
