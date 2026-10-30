use serde_json::{json, Value};

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

    fn name(&mut self) -> String {
        let st = self.i;
        match self.peek() {
            Some(c) if c.is_ascii_alphabetic() || c == b'_' => self.i += 1,
            _ => panic!("expected an identifier"),
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

    fn expect(&mut self, c: u8) {
        if self.peek() == Some(c) {
            self.i += 1;
        } else {
            panic!("expected token");
        }
    }

    fn ty(&mut self) -> Value {
        let mut alts = vec![self.alt()];
        loop {
            self.ws();
            if self.peek() == Some(b'|') {
                self.i += 1;
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

    fn list_types(&mut self) -> Vec<Value> {
        let mut v = vec![self.ty()];
        loop {
            self.ws();
            match self.peek() {
                Some(b',') => {
                    self.i += 1;
                    v.push(self.ty());
                }
                Some(b']') => {
                    self.i += 1;
                    return v;
                }
                _ => panic!("expected ']'"),
            }
        }
    }

    fn alt(&mut self) -> Value {
        self.ws();
        let n = self.name();
        match n.as_str() {
            "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" => {
                json!({ "k": n })
            }
            "tuple" | "list" | "map" => {
                self.expect(b'[');
                let mut v = self.list_types();
                match n.as_str() {
                    "tuple" => json!({"k": "tuple", "items": v}),
                    "list" => {
                        if v.len() != 1 {
                            panic!("list takes exactly one type");
                        }
                        json!({"k": "list", "item": v.pop().unwrap()})
                    }
                    _ => {
                        if v.len() != 2 {
                            panic!("map takes exactly two types");
                        }
                        let val = v.pop().unwrap();
                        let key = v.pop().unwrap();
                        json!({"k": "map", "key": key, "val": val})
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
                        panic!("duplicate field");
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
                        _ => panic!("expected ']'"),
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
    let v = p.ty();
    p.ws();
    if p.i != p.b.len() {
        panic!("unexpected text");
    }
    v
}
