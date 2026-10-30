use serde_json::{json, Map, Value};

type R<T> = Result<T, String>;

const SCALARS: [&str; 8] = ["text", "bytes", "bool", "none", "i64", "u64", "f64", "json"];
const MAX_DEPTH: usize = 256;

struct P<'a> {
    b: &'a [u8],
    i: usize,
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

    fn ident(&mut self) -> R<String> {
        self.ws();
        if !self.ident_start() {
            return Err(format!("expected an identifier at {}", self.i));
        }
        let st = self.i;
        while self.i < self.b.len() && (self.b[self.i].is_ascii_alphanumeric() || self.b[self.i] == b'_') {
            self.i += 1;
        }
        Ok(String::from_utf8_lossy(&self.b[st..self.i]).into_owned())
    }

    fn lit(&mut self, s: &str) -> bool {
        self.ws();
        if self.b[self.i..].starts_with(s.as_bytes()) {
            self.i += s.len();
            true
        } else {
            false
        }
    }

    fn expect(&mut self, s: &str) -> R<()> {
        if self.lit(s) {
            Ok(())
        } else {
            Err(format!("expected '{}' at {}", s, self.i))
        }
    }

    fn word(&mut self, w: &str) -> bool {
        self.ws();
        if !self.ident_start() {
            return false;
        }
        let save = self.i;
        match self.ident() {
            Ok(x) if x == w => true,
            _ => {
                self.i = save;
                false
            }
        }
    }

    fn prefix(&mut self) {
        let save = self.i;
        let ok = self.try_prefix();
        if !ok {
            self.i = save;
        }
    }

    fn try_prefix(&mut self) -> bool {
        if self.word("pub") {
            if !self.word("fn") {
                return false;
            }
        } else if self.word("export") {
            if !self.word("default") || !self.word("function") {
                return false;
            }
        } else {
            return false;
        }
        self.ws();
        self.ident_start()
    }

    fn ty(&mut self, depth: usize) -> R<Value> {
        let mut alts: Vec<Value> = Vec::new();
        loop {
            let a = self.alt(depth)?;
            alts.push(a);
            if !self.lit("|") {
                break;
            }
        }
        for x in 0..alts.len() {
            for y in 0..x {
                if alts[x] == alts[y] {
                    return Err("duplicate alternative".into());
                }
            }
        }
        if alts.len() >= 2 {
            Ok(json!({"k": "union", "alts": alts}))
        } else {
            Ok(alts.pop().unwrap())
        }
    }

    fn alt(&mut self, depth: usize) -> R<Value> {
        let name = self.ident()?;
        match name.as_str() {
            "tuple" | "list" | "map" | "record" => {
                if depth + 1 > MAX_DEPTH {
                    return Err("nesting too deep".into());
                }
                let d = depth + 1;
                self.expect("[")?;
                let v = match name.as_str() {
                    "tuple" => {
                        let mut items = Vec::new();
                        loop {
                            items.push(self.ty(d)?);
                            if !self.lit(",") {
                                break;
                            }
                        }
                        json!({"k": "tuple", "items": items})
                    }
                    "list" => {
                        let item = self.ty(d)?;
                        json!({"k": "list", "item": item})
                    }
                    "map" => {
                        let key = self.ty(d)?;
                        self.expect(",")?;
                        let val = self.ty(d)?;
                        json!({"k": "map", "key": key, "val": val})
                    }
                    _ => {
                        let mut fields: Vec<Value> = Vec::new();
                        let mut names: Vec<String> = Vec::new();
                        loop {
                            let f = self.ident()?;
                            if names.contains(&f) {
                                return Err("duplicate field name".into());
                            }
                            self.expect(":")?;
                            let t = self.ty(d)?;
                            names.push(f.clone());
                            fields.push(json!([f, t]));
                            if !self.lit(",") {
                                break;
                            }
                        }
                        json!({"k": "record", "fields": fields})
                    }
                };
                self.expect("]")?;
                Ok(v)
            }
            s if SCALARS.contains(&s) => Ok(json!({"k": s})),
            _ => Err(format!("unknown type at {}", self.i)),
        }
    }

    fn sig(&mut self) -> R<Value> {
        self.prefix();
        let name = self.ident()?;
        self.expect("(")?;
        let mut args: Vec<Value> = Vec::new();
        let mut names: Vec<String> = Vec::new();
        let mut rest_seen = false;
        self.ws();
        if !self.lit(")") {
            loop {
                if rest_seen {
                    return Err("a rest parameter must be last".into());
                }
                let rest = self.lit("...");
                let n = self.ident()?;
                if names.contains(&n) {
                    return Err("duplicate parameter name".into());
                }
                self.expect(":")?;
                let t = self.ty(0)?;
                let mut m = Map::new();
                m.insert("name".into(), Value::String(n.clone()));
                m.insert("type".into(), t);
                if rest {
                    m.insert("rest".into(), Value::Bool(true));
                    rest_seen = true;
                }
                names.push(n);
                args.push(Value::Object(m));
                if self.lit(",") {
                    continue;
                }
                self.expect(")")?;
                break;
            }
        }
        if !(self.lit("->") || self.lit(":")) {
            return Err("expected '->' or ':'".into());
        }
        let result = self.ty(0)?;
        self.ws();
        if self.i != self.b.len() {
            return Err(format!("unexpected trailing input at {}", self.i));
        }
        Ok(json!({"name": name, "args": args, "result": result}))
    }
}

pub fn parse_sig(s: &str) -> serde_json::Value {
    let mut p = P { b: s.as_bytes(), i: 0 };
    match p.sig() {
        Ok(v) => v,
        Err(e) => panic!("bad SIG: {}", e),
    }
}
