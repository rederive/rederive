use serde_json::{json, Map, Value};

const MAX_DEPTH: usize = 16;

struct P<'a> {
    b: &'a [u8],
    i: usize,
}

fn kind(n: &Value) -> &str {
    n.get("k").and_then(|k| k.as_str()).unwrap_or("")
}

fn arr<'a>(n: &'a Value, key: &str) -> &'a Vec<Value> {
    n.get(key).and_then(|v| v.as_array()).expect("array")
}

fn same(a: &Value, b: &Value) -> bool {
    let k = kind(a);
    if k != kind(b) {
        return false;
    }
    match k {
        "tuple" => {
            let (x, y) = (arr(a, "items"), arr(b, "items"));
            x.len() == y.len() && x.iter().zip(y.iter()).all(|(p, q)| same(p, q))
        }
        "list" => same(&a["item"], &b["item"]),
        "map" => same(&a["key"], &b["key"]) && same(&a["val"], &b["val"]),
        "record" => {
            let (x, y) = (arr(a, "fields"), arr(b, "fields"));
            x.len() == y.len()
                && x.iter().all(|f| {
                    y.iter().any(|g| f[0] == g[0] && same(&f[1], &g[1]))
                })
        }
        "union" => {
            let (x, y) = (arr(a, "alts"), arr(b, "alts"));
            x.iter().all(|p| y.iter().any(|q| same(p, q)))
                && y.iter().all(|q| x.iter().any(|p| same(p, q)))
        }
        _ => true,
    }
}

fn json_shaped(n: &Value) -> bool {
    match kind(n) {
        "none" | "bool" | "f64" | "text" | "json" => true,
        "list" => json_shaped(&n["item"]),
        "tuple" => arr(n, "items").iter().all(json_shaped),
        "map" => kind(&n["key"]) == "text" && json_shaped(&n["val"]),
        "record" => arr(n, "fields").iter().all(|f| json_shaped(&f[1])),
        "union" => arr(n, "alts").iter().all(json_shaped),
        _ => false,
    }
}

fn covers(e: &Value, l: &Value) -> bool {
    if same(e, l) {
        return true;
    }
    let ek = kind(e);
    let lk = kind(l);
    if ek == "json" && json_shaped(l) {
        return true;
    }
    if ek == "list" && lk == "list" && covers(&e["item"], &l["item"]) {
        return true;
    }
    if ek == "tuple" && lk == "tuple" {
        let (x, y) = (arr(e, "items"), arr(l, "items"));
        if x.len() == y.len() && x.iter().zip(y.iter()).all(|(p, q)| covers(p, q)) {
            return true;
        }
    }
    if ek == "map" && lk == "map" && covers(&e["key"], &l["key"]) && covers(&e["val"], &l["val"]) {
        return true;
    }
    if ek == "record" && lk == "record" {
        let (x, y) = (arr(e, "fields"), arr(l, "fields"));
        if x.iter().all(|f| y.iter().any(|g| f[0] == g[0] && covers(&f[1], &g[1]))) {
            return true;
        }
    }
    if ek == "union" && arr(e, "alts").iter().any(|a| covers(a, l)) {
        return true;
    }
    if lk == "union" && arr(l, "alts").iter().all(|a| covers(e, a)) {
        return true;
    }
    false
}

impl<'a> P<'a> {
    fn ws(&mut self) {
        while self.i < self.b.len() && matches!(self.b[self.i], b' ' | b'\t' | b'\r' | b'\n') {
            self.i += 1;
        }
    }

    fn eat(&mut self, c: u8) -> bool {
        self.ws();
        if self.i < self.b.len() && self.b[self.i] == c {
            self.i += 1;
            true
        } else {
            false
        }
    }

    fn name(&mut self) -> &'a str {
        self.ws();
        let s = self.i;
        if self.i < self.b.len() && (self.b[self.i].is_ascii_alphabetic() || self.b[self.i] == b'_') {
            self.i += 1;
            while self.i < self.b.len() && (self.b[self.i].is_ascii_alphanumeric() || self.b[self.i] == b'_') {
                self.i += 1;
            }
        } else {
            panic!("expected an identifier");
        }
        std::str::from_utf8(&self.b[s..self.i]).unwrap()
    }

    fn ty(&mut self, depth: usize) -> Value {
        let mut alts = vec![self.alt(depth)];
        while self.eat(b'|') {
            alts.push(self.alt(depth));
        }
        if alts.len() == 1 {
            return alts.pop().unwrap();
        }
        for j in 1..alts.len() {
            for i in 0..j {
                if covers(&alts[i], &alts[j]) {
                    panic!("unreachable union alternative");
                }
            }
        }
        json!({"k": "union", "alts": alts})
    }

    fn alt(&mut self, depth: usize) -> Value {
        let n = self.name();
        match n {
            "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" => json!({ "k": n }),
            "tuple" | "list" | "map" | "record" => {
                if !self.eat(b'[') {
                    panic!("expected [");
                }
                if depth + 1 > MAX_DEPTH {
                    panic!("types nest too deep");
                }
                let d = depth + 1;
                let mut m = Map::new();
                m.insert("k".into(), Value::String(n.into()));
                if n == "record" {
                    let mut fields: Vec<Value> = Vec::new();
                    let mut names: Vec<&str> = Vec::new();
                    loop {
                        let f = self.name();
                        if names.contains(&f) {
                            panic!("duplicate field");
                        }
                        names.push(f);
                        if !self.eat(b':') {
                            panic!("expected :");
                        }
                        let t = self.ty(d);
                        fields.push(Value::Array(vec![Value::String(f.into()), t]));
                        if self.eat(b',') {
                            continue;
                        }
                        break;
                    }
                    if !self.eat(b']') {
                        panic!("expected ]");
                    }
                    m.insert("fields".into(), Value::Array(fields));
                } else {
                    let mut parts = vec![self.ty(d)];
                    while self.eat(b',') {
                        parts.push(self.ty(d));
                    }
                    if !self.eat(b']') {
                        panic!("expected ]");
                    }
                    match n {
                        "tuple" => {
                            m.insert("items".into(), Value::Array(parts));
                        }
                        "list" => {
                            if parts.len() != 1 {
                                panic!("list takes one");
                            }
                            m.insert("item".into(), parts.pop().unwrap());
                        }
                        _ => {
                            if parts.len() != 2 {
                                panic!("map takes two");
                            }
                            let v = parts.pop().unwrap();
                            let k = parts.pop().unwrap();
                            m.insert("key".into(), k);
                            m.insert("val".into(), v);
                        }
                    }
                }
                Value::Object(m)
            }
            _ => panic!("unknown abstract type"),
        }
    }
}

pub fn parse_type(s: &str) -> serde_json::Value {
    let mut p = P { b: s.as_bytes(), i: 0 };
    let t = p.ty(0);
    p.ws();
    if p.i != p.b.len() {
        panic!("unexpected text");
    }
    t
}
