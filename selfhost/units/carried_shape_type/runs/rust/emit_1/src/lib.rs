use serde_json::{json, Value};

fn is_ws(c: char) -> bool {
    matches!(c, ' ' | '\t' | '\r' | '\n')
}

fn normalize(s: &str) -> String {
    let s = s.trim_matches(is_ws);
    if let Some(rest) = s.strip_prefix("map") {
        let run_len: usize = rest.chars().take_while(|c| is_ws(*c)).map(|c| c.len_utf8()).sum();
        if run_len > 0 {
            let run_end = 3 + run_len;
            if let Some(nc) = s[run_end..].chars().next() {
                let start = run_end + nc.len_utf8();
                if let Some(off) = s[start..].find("->") {
                    let idx = start + off;
                    let k = &s[run_end..idx];
                    let v = &s[idx + 2..];
                    return format!("map[{}, {}]", normalize(k), normalize(v));
                }
            }
        }
    }
    s.to_string()
}

fn widen(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let n = c.len();
    let mut out = String::new();
    let mut i = 0;
    while i < n {
        if (c[i] == 'u' || c[i] == 'i') && i + 1 < n {
            let (len, rep) = if i + 2 < n && c[i + 1] == '1' && c[i + 2] == '6' {
                (3, true)
            } else if i + 2 < n && c[i + 1] == '3' && c[i + 2] == '2' {
                (3, true)
            } else if c[i + 1] == '8' {
                (2, true)
            } else {
                (0, false)
            };
            if rep {
                let mut l = i;
                let left_ok = loop {
                    if l == 0 {
                        break true;
                    }
                    l -= 1;
                    if is_ws(c[l]) {
                        continue;
                    }
                    break matches!(c[l], '[' | ',' | '|' | ':');
                };
                let mut r = i + len;
                while r < n && is_ws(c[r]) {
                    r += 1;
                }
                let right_ok = r >= n || matches!(c[r], ']' | ',' | '|');
                if left_ok && right_ok {
                    out.push_str(if c[i] == 'u' { "u64" } else { "i64" });
                    i += len;
                    continue;
                }
            }
        }
        out.push(c[i]);
        i += 1;
    }
    out
}

struct P {
    c: Vec<char>,
    i: usize,
    depth: usize,
}

fn key(v: &Value) -> String {
    match v["k"].as_str().unwrap() {
        "list" => format!("list({})", key(&v["item"])),
        "map" => format!("map({},{})", key(&v["key"]), key(&v["val"])),
        "tuple" => format!(
            "tuple({})",
            v["items"].as_array().unwrap().iter().map(key).collect::<Vec<_>>().join(",")
        ),
        "record" => {
            let mut f: Vec<String> = v["fields"]
                .as_array()
                .unwrap()
                .iter()
                .map(|p| format!("{}:{}", p[0].as_str().unwrap(), key(&p[1])))
                .collect();
            f.sort();
            format!("record({})", f.join(","))
        }
        "union" => {
            let mut f: Vec<String> = v["alts"].as_array().unwrap().iter().map(key).collect();
            f.sort();
            format!("union({})", f.join(","))
        }
        w => w.to_string(),
    }
}

fn kind(v: &Value) -> &str {
    v["k"].as_str().unwrap()
}

fn jsonable(v: &Value) -> bool {
    match kind(v) {
        "none" | "bool" | "f64" | "text" | "json" => true,
        "list" => jsonable(&v["item"]),
        "tuple" => v["items"].as_array().unwrap().iter().all(jsonable),
        "map" => kind(&v["key"]) == "text" && jsonable(&v["val"]),
        "record" => v["fields"].as_array().unwrap().iter().all(|p| jsonable(&p[1])),
        "union" => v["alts"].as_array().unwrap().iter().all(jsonable),
        _ => false,
    }
}

fn covers(a: &Value, b: &Value) -> bool {
    if key(a) == key(b) {
        return true;
    }
    let (ka, kb) = (kind(a), kind(b));
    if ka == "json" && jsonable(b) {
        return true;
    }
    if ka == "list" && kb == "list" && covers(&a["item"], &b["item"]) {
        return true;
    }
    if ka == "tuple" && kb == "tuple" {
        let (x, y) = (a["items"].as_array().unwrap(), b["items"].as_array().unwrap());
        if x.len() == y.len() && x.iter().zip(y).all(|(p, q)| covers(p, q)) {
            return true;
        }
    }
    if ka == "map" && kb == "map" && covers(&a["key"], &b["key"]) && covers(&a["val"], &b["val"]) {
        return true;
    }
    if ka == "record" && kb == "record" {
        let gb = b["fields"].as_array().unwrap();
        let ok = a["fields"].as_array().unwrap().iter().all(|f| {
            gb.iter().any(|g| g[0] == f[0] && covers(&f[1], &g[1]))
        });
        if ok {
            return true;
        }
    }
    if ka == "union" && a["alts"].as_array().unwrap().iter().any(|x| covers(x, b)) {
        return true;
    }
    if kb == "union" && b["alts"].as_array().unwrap().iter().all(|y| covers(a, y)) {
        return true;
    }
    false
}

impl P {
    fn ws(&mut self) {
        while self.i < self.c.len() && is_ws(self.c[self.i]) {
            self.i += 1;
        }
    }
    fn peek(&mut self) -> Option<char> {
        self.ws();
        self.c.get(self.i).copied()
    }
    fn expect(&mut self, ch: char) {
        if self.peek() != Some(ch) {
            panic!("expected {}", ch);
        }
        self.i += 1;
    }
    fn ident(&mut self) -> String {
        self.ws();
        let st = self.i;
        let ok_first = |c: char| c.is_ascii_alphabetic() || c == '_';
        if self.i >= self.c.len() || !ok_first(self.c[self.i]) {
            panic!("expected an identifier");
        }
        while self.i < self.c.len() && (self.c[self.i].is_ascii_alphanumeric() || self.c[self.i] == '_') {
            self.i += 1;
        }
        self.c[st..self.i].iter().collect()
    }
    fn open(&mut self) {
        self.depth += 1;
        if self.depth > 16 {
            panic!("types nest deeper than 16");
        }
    }
    fn typ(&mut self) -> Value {
        let mut alts = vec![self.alt()];
        while self.peek() == Some('|') {
            self.i += 1;
            alts.push(self.alt());
        }
        if alts.len() == 1 {
            return alts.pop().unwrap();
        }
        for j in 1..alts.len() {
            for i in 0..j {
                if covers(&alts[i], &alts[j]) {
                    panic!("a union alternative is unreachable");
                }
            }
        }
        json!({"k": "union", "alts": alts})
    }
    fn alt(&mut self) -> Value {
        let w = self.ident();
        match w.as_str() {
            "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" => json!({"k": w}),
            "list" => {
                self.expect('[');
                self.open();
                let t = self.typ();
                self.expect(']');
                self.depth -= 1;
                json!({"k": "list", "item": t})
            }
            "map" => {
                self.expect('[');
                self.open();
                let k = self.typ();
                self.expect(',');
                let v = self.typ();
                self.expect(']');
                self.depth -= 1;
                json!({"k": "map", "key": k, "val": v})
            }
            "tuple" => {
                self.expect('[');
                self.open();
                let mut items = vec![self.typ()];
                while self.peek() == Some(',') {
                    self.i += 1;
                    items.push(self.typ());
                }
                self.expect(']');
                self.depth -= 1;
                json!({"k": "tuple", "items": items})
            }
            "record" => {
                self.expect('[');
                self.open();
                let mut fields: Vec<Value> = Vec::new();
                let mut names: Vec<String> = Vec::new();
                loop {
                    let n = self.ident();
                    if names.contains(&n) {
                        panic!("duplicate field");
                    }
                    self.expect(':');
                    let t = self.typ();
                    names.push(n.clone());
                    fields.push(json!([n, t]));
                    if self.peek() == Some(',') {
                        self.i += 1;
                    } else {
                        break;
                    }
                }
                self.expect(']');
                self.depth -= 1;
                json!({"k": "record", "fields": fields})
            }
            _ => panic!("unknown type word"),
        }
    }
}

pub fn carried_shape_type(shape: &str) -> serde_json::Value {
    let seg = shape.split(';').next().unwrap_or("");
    let text = widen(&normalize(seg));
    let mut p = P { c: text.chars().collect(), i: 0, depth: 0 };
    let t = p.typ();
    if p.peek().is_some() {
        panic!("trailing text");
    }
    t
}
