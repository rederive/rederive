use serde_json::{json, Map, Value};

struct P<'a> {
    b: &'a [u8],
    i: usize,
}

fn bad(m: &str) -> ! {
    panic!("{}", m)
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

    fn name(&mut self) -> String {
        let st = self.i;
        match self.peek() {
            Some(c) if c.is_ascii_alphabetic() || c == b'_' => self.i += 1,
            _ => bad("expected an identifier"),
        }
        while let Some(c) = self.peek() {
            if c.is_ascii_alphanumeric() || c == b'_' {
                self.i += 1;
            } else {
                break;
            }
        }
        String::from_utf8(self.b[st..self.i].to_vec()).unwrap()
    }

    fn ty(&mut self) -> Value {
        self.ws();
        let mut alts = vec![self.alt()];
        self.ws();
        while self.peek() == Some(b'|') {
            self.i += 1;
            self.ws();
            alts.push(self.alt());
            self.ws();
        }
        if alts.len() == 1 {
            alts.pop().unwrap()
        } else {
            json!({"k": "union", "alts": alts})
        }
    }

    fn expect(&mut self, c: u8) {
        if self.peek() == Some(c) {
            self.i += 1;
        } else {
            bad("unexpected character");
        }
    }

    fn alt(&mut self) -> Value {
        let n = self.name();
        match n.as_str() {
            "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" => {
                json!({ "k": n })
            }
            "tuple" | "list" | "map" => {
                self.expect(b'[');
                let mut parts = Vec::new();
                loop {
                    parts.push(self.ty());
                    self.ws();
                    match self.peek() {
                        Some(b',') => self.i += 1,
                        Some(b']') => {
                            self.i += 1;
                            break;
                        }
                        _ => bad("expected ']'"),
                    }
                }
                match n.as_str() {
                    "tuple" => json!({"k": "tuple", "items": parts}),
                    "list" => {
                        if parts.len() != 1 {
                            bad("list takes exactly one type");
                        }
                        json!({"k": "list", "item": parts.pop().unwrap()})
                    }
                    _ => {
                        if parts.len() != 2 {
                            bad("map takes exactly two types");
                        }
                        let v = parts.pop().unwrap();
                        let k = parts.pop().unwrap();
                        json!({"k": "map", "key": k, "val": v})
                    }
                }
            }
            "record" => {
                self.expect(b'[');
                let mut fields: Vec<Value> = Vec::new();
                let mut seen: Vec<String> = Vec::new();
                loop {
                    self.ws();
                    let f = self.name();
                    if seen.contains(&f) {
                        bad("duplicate field");
                    }
                    self.ws();
                    self.expect(b':');
                    let t = self.ty();
                    seen.push(f.clone());
                    fields.push(Value::Array(vec![Value::String(f), t]));
                    self.ws();
                    match self.peek() {
                        Some(b',') => self.i += 1,
                        Some(b']') => {
                            self.i += 1;
                            break;
                        }
                        _ => bad("expected ']'"),
                    }
                }
                let mut m = Map::new();
                m.insert("k".to_string(), Value::String("record".to_string()));
                m.insert("fields".to_string(), Value::Array(fields));
                Value::Object(m)
            }
            _ => bad("unknown abstract type"),
        }
    }
}

pub fn parse_type(s: &str) -> serde_json::Value {
    let mut p = P { b: s.as_bytes(), i: 0 };
    let v = p.ty();
    p.ws();
    if p.i != p.b.len() {
        bad("unexpected text");
    }
    v
}
