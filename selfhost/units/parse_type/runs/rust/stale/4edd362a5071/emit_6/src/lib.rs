use serde_json::{json, Map, Value};

const MAX_DEPTH: usize = 256;

struct P<'a> {
    b: &'a [u8],
    i: usize,
}

fn node(k: &str) -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("k".to_string(), Value::String(k.to_string()));
    m
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

    fn typ(&mut self, depth: usize) -> Value {
        let mut alts = vec![self.alt(depth)];
        loop {
            self.ws();
            if self.peek() == Some(b'|') {
                self.i += 1;
                self.ws();
                let a = self.alt(depth);
                if alts.contains(&a) {
                    panic!("a union names the same alternative twice");
                }
                alts.push(a);
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
        self.ws();
        let n = self.name();
        match n.as_str() {
            "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" => {
                Value::Object(node(&n))
            }
            "tuple" | "list" | "map" | "record" => {
                self.ws();
                if self.peek() != Some(b'[') {
                    panic!("expected '['");
                }
                self.i += 1;
                if depth + 1 > MAX_DEPTH {
                    panic!("types nest too deep");
                }
                let d = depth + 1;
                if n == "record" {
                    let mut fields: Vec<Value> = Vec::new();
                    let mut names: Vec<String> = Vec::new();
                    loop {
                        self.ws();
                        let f = self.name();
                        if names.contains(&f) {
                            panic!("duplicate field");
                        }
                        self.ws();
                        if self.peek() != Some(b':') {
                            panic!("expected ':'");
                        }
                        self.i += 1;
                        self.ws();
                        let t = self.typ(d);
                        names.push(f.clone());
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
                    self.ws();
                    parts.push(self.typ(d));
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
                match n.as_str() {
                    "tuple" => json!({"k": "tuple", "items": parts}),
                    "list" => {
                        if parts.len() != 1 {
                            panic!("list takes exactly one type");
                        }
                        json!({"k": "list", "item": parts.pop().unwrap()})
                    }
                    _ => {
                        if parts.len() != 2 {
                            panic!("map takes exactly two types");
                        }
                        let v = parts.pop().unwrap();
                        let k = parts.pop().unwrap();
                        json!({"k": "map", "key": k, "val": v})
                    }
                }
            }
            _ => panic!("unknown abstract type"),
        }
    }
}

pub fn parse_type(s: &str) -> serde_json::Value {
    let mut p = P { b: s.as_bytes(), i: 0 };
    let v = p.typ(0);
    p.ws();
    if p.i != p.b.len() {
        panic!("unexpected text");
    }
    v
}
