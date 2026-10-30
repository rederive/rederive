use serde_json::{json, Map, Value};

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

    fn peek(&self) -> Option<u8> {
        self.b.get(self.i).copied()
    }

    fn name(&mut self) -> &'a str {
        let st = self.i;
        if self.i < self.b.len() && (self.b[self.i].is_ascii_alphabetic() || self.b[self.i] == b'_') {
            self.i += 1;
            while self.i < self.b.len() && (self.b[self.i].is_ascii_alphanumeric() || self.b[self.i] == b'_') {
                self.i += 1;
            }
        } else {
            panic!("expected an identifier");
        }
        std::str::from_utf8(&self.b[st..self.i]).unwrap()
    }

    fn expect(&mut self, c: u8) {
        self.ws();
        if self.peek() == Some(c) {
            self.i += 1;
        } else {
            panic!("expected token");
        }
    }

    fn ty(&mut self, depth: usize) -> Value {
        let mut alts: Vec<Value> = Vec::new();
        loop {
            self.ws();
            let a = self.alt(depth);
            if alts.contains(&a) {
                panic!("duplicate alt");
            }
            alts.push(a);
            self.ws();
            if self.peek() == Some(b'|') {
                self.i += 1;
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

    fn alt(&mut self, depth: usize) -> Value {
        let n = self.name();
        match n {
            "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" => json!({ "k": n }),
            "tuple" | "list" | "map" | "record" => {
                self.ws();
                if self.peek() != Some(b'[') {
                    panic!("expected '['");
                }
                if depth + 1 > MAX_DEPTH {
                    panic!("too deep");
                }
                self.i += 1;
                self.composite(n, depth + 1)
            }
            _ => panic!("unknown abstract type"),
        }
    }

    fn composite(&mut self, n: &str, depth: usize) -> Value {
        if n == "record" {
            let mut fields: Vec<Value> = Vec::new();
            let mut names: Vec<&str> = Vec::new();
            loop {
                self.ws();
                let f = self.name();
                if names.contains(&f) {
                    panic!("duplicate field");
                }
                names.push(f);
                self.expect(b':');
                let t = self.ty(depth);
                fields.push(json!([f, t]));
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
            return json!({"k": "record", "fields": fields});
        }
        let mut parts: Vec<Value> = Vec::new();
        loop {
            let t = self.ty(depth);
            parts.push(t);
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
        let mut m = Map::new();
        m.insert("k".to_string(), Value::String(n.to_string()));
        match n {
            "tuple" => {
                m.insert("items".to_string(), Value::Array(parts));
            }
            "list" => {
                if parts.len() != 1 {
                    panic!("list takes exactly one type");
                }
                m.insert("item".to_string(), parts.pop().unwrap());
            }
            _ => {
                if parts.len() != 2 {
                    panic!("map takes exactly two types");
                }
                let v = parts.pop().unwrap();
                let k = parts.pop().unwrap();
                m.insert("key".to_string(), k);
                m.insert("val".to_string(), v);
            }
        }
        Value::Object(m)
    }
}

pub fn parse_type(s: &str) -> serde_json::Value {
    let mut p = P { b: s.as_bytes(), i: 0 };
    p.ws();
    let v = p.ty(0);
    p.ws();
    if p.i != p.b.len() {
        panic!("unexpected text");
    }
    v
}
