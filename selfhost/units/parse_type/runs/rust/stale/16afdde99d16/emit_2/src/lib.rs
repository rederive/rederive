use serde_json::{json, Map, Value};

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

    fn peek(&self) -> Option<u8> {
        self.b.get(self.i).copied()
    }

    fn expect(&mut self, c: u8) {
        if self.peek() == Some(c) {
            self.i += 1;
        } else {
            panic!("expected {}", c as char);
        }
    }

    fn name(&mut self) -> &'a str {
        let start = self.i;
        if let Some(c) = self.peek() {
            if c.is_ascii_alphabetic() || c == b'_' {
                self.i += 1;
                while let Some(c) = self.peek() {
                    if c.is_ascii_alphanumeric() || c == b'_' {
                        self.i += 1;
                    } else {
                        break;
                    }
                }
            }
        }
        if self.i == start {
            panic!("expected an identifier");
        }
        std::str::from_utf8(&self.b[start..self.i]).unwrap()
    }

    fn ty(&mut self) -> Value {
        let mut alts = vec![self.alt()];
        loop {
            self.ws();
            if self.peek() == Some(b'|') {
                self.i += 1;
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
        let n = self.name();
        match n {
            "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" => {
                json!({ "k": n })
            }
            "tuple" | "list" | "map" => {
                self.expect(b'[');
                let mut parts = Vec::new();
                loop {
                    self.ws();
                    parts.push(self.ty());
                    self.ws();
                    if self.peek() == Some(b',') {
                        self.i += 1;
                    } else {
                        self.expect(b']');
                        break;
                    }
                }
                let mut m = Map::new();
                match n {
                    "tuple" => {
                        m.insert("k".into(), json!("tuple"));
                        m.insert("items".into(), Value::Array(parts));
                    }
                    "list" => {
                        if parts.len() != 1 {
                            panic!("list takes exactly one type");
                        }
                        m.insert("k".into(), json!("list"));
                        m.insert("item".into(), parts.pop().unwrap());
                    }
                    _ => {
                        if parts.len() != 2 {
                            panic!("map takes exactly two types");
                        }
                        let val = parts.pop().unwrap();
                        let key = parts.pop().unwrap();
                        m.insert("k".into(), json!("map"));
                        m.insert("key".into(), key);
                        m.insert("val".into(), val);
                    }
                }
                Value::Object(m)
            }
            "record" => {
                self.expect(b'[');
                let mut fields: Vec<Value> = Vec::new();
                let mut seen: Vec<&str> = Vec::new();
                loop {
                    self.ws();
                    let f = self.name();
                    if seen.contains(&f) {
                        panic!("duplicate field");
                    }
                    seen.push(f);
                    self.ws();
                    self.expect(b':');
                    self.ws();
                    let t = self.ty();
                    fields.push(Value::Array(vec![Value::String(f.to_string()), t]));
                    self.ws();
                    if self.peek() == Some(b',') {
                        self.i += 1;
                    } else {
                        self.expect(b']');
                        break;
                    }
                }
                json!({"k": "record", "fields": fields})
            }
            _ => panic!("unknown abstract type"),
        }
    }
}

pub fn parse_type(s: &str) -> serde_json::Value {
    let mut p = P { b: s.as_bytes(), i: 0 };
    p.ws();
    let v = p.ty();
    p.ws();
    if p.i != p.b.len() {
        panic!("unexpected text");
    }
    v
}
