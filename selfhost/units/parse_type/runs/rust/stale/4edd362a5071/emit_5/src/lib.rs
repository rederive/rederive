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

    fn ident(&mut self) -> String {
        let st = self.i;
        match self.peek() {
            Some(c) if c.is_ascii_alphabetic() || c == b'_' => {}
            _ => panic!("expected an identifier at {}", self.i),
        }
        self.i += 1;
        while let Some(c) = self.peek() {
            if c.is_ascii_alphanumeric() || c == b'_' {
                self.i += 1;
            } else {
                break;
            }
        }
        String::from_utf8_lossy(&self.b[st..self.i]).into_owned()
    }

    fn union(&mut self, d: usize) -> Value {
        let mut alts: Vec<Value> = Vec::new();
        loop {
            let a = self.alt(d);
            if alts.contains(&a) {
                panic!("a union names the same alternative twice at {}", self.i);
            }
            alts.push(a);
            self.ws();
            if self.peek() == Some(b'|') {
                self.i += 1;
                continue;
            }
            break;
        }
        if alts.len() == 1 {
            alts.pop().unwrap()
        } else {
            json!({"k": "union", "alts": alts})
        }
    }

    fn alt(&mut self, d: usize) -> Value {
        self.ws();
        let name = self.ident();
        match name.as_str() {
            "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" => {
                json!({ "k": name })
            }
            "tuple" | "list" | "map" | "record" => {
                if d + 1 > MAX_DEPTH {
                    panic!("types nest deeper than {} at {}", MAX_DEPTH, self.i);
                }
                self.ws();
                if self.peek() != Some(b'[') {
                    panic!("expected '[' at {}", self.i);
                }
                self.i += 1;
                if name == "record" {
                    self.record(d + 1)
                } else {
                    self.composite(&name, d + 1)
                }
            }
            _ => panic!("unknown abstract type '{}' at {}", name, self.i),
        }
    }

    fn composite(&mut self, name: &str, d: usize) -> Value {
        let mut parts: Vec<Value> = Vec::new();
        loop {
            parts.push(self.union(d));
            self.ws();
            match self.peek() {
                Some(b',') => {
                    self.i += 1;
                }
                Some(b']') => {
                    self.i += 1;
                    break;
                }
                _ => panic!("expected ']' at {}", self.i),
            }
        }
        let mut m = Map::new();
        m.insert("k".to_string(), Value::String(name.to_string()));
        match name {
            "tuple" => {
                m.insert("items".to_string(), Value::Array(parts));
            }
            "list" => {
                if parts.len() != 1 {
                    panic!("list takes exactly one type at {}", self.i);
                }
                m.insert("item".to_string(), parts.pop().unwrap());
            }
            _ => {
                if parts.len() != 2 {
                    panic!("map takes exactly two types at {}", self.i);
                }
                let v = parts.pop().unwrap();
                let k = parts.pop().unwrap();
                m.insert("key".to_string(), k);
                m.insert("val".to_string(), v);
            }
        }
        Value::Object(m)
    }

    fn record(&mut self, d: usize) -> Value {
        let mut fields: Vec<Value> = Vec::new();
        let mut names: Vec<String> = Vec::new();
        loop {
            self.ws();
            let n = self.ident();
            if names.contains(&n) {
                panic!("duplicate record field at {}", self.i);
            }
            self.ws();
            if self.peek() != Some(b':') {
                panic!("expected ':' at {}", self.i);
            }
            self.i += 1;
            let t = self.union(d);
            names.push(n.clone());
            fields.push(Value::Array(vec![Value::String(n), t]));
            self.ws();
            match self.peek() {
                Some(b',') => {
                    self.i += 1;
                }
                Some(b']') => {
                    self.i += 1;
                    break;
                }
                _ => panic!("expected ']' at {}", self.i),
            }
        }
        json!({"k": "record", "fields": fields})
    }
}

pub fn parse_type(s: &str) -> serde_json::Value {
    let mut p = P { b: s.as_bytes(), i: 0 };
    let v = p.union(0);
    p.ws();
    if p.i != p.b.len() {
        panic!("unexpected text at {}", p.i);
    }
    v
}
