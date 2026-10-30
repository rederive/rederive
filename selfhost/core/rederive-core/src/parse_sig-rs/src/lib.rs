use serde_json::{json, Map, Value};

#[derive(Clone)]
enum T {
    S(String),
    U(Vec<T>),
    Tu(Vec<T>),
    L(Box<T>),
    M(Box<T>, Box<T>),
    R(Vec<(String, T)>),
}

const SCALARS: [&str; 8] = ["text", "bytes", "bool", "none", "i64", "u64", "f64", "json"];

fn key(t: &T) -> String {
    match t {
        T::S(n) => n.clone(),
        T::U(a) => {
            let mut k: Vec<String> = a.iter().map(key).collect();
            k.sort();
            format!("union[{}]", k.join(","))
        }
        T::Tu(a) => format!("tuple[{}]", a.iter().map(key).collect::<Vec<_>>().join(",")),
        T::L(i) => format!("list[{}]", key(i)),
        T::M(k, v) => format!("map[{},{}]", key(k), key(v)),
        T::R(f) => {
            let mut k: Vec<String> = f.iter().map(|(n, t)| format!("{}={}", n, key(t))).collect();
            k.sort();
            format!("record[{}]", k.join(","))
        }
    }
}

fn shaped(t: &T) -> bool {
    match t {
        T::S(n) => matches!(n.as_str(), "none" | "bool" | "f64" | "text" | "json"),
        T::L(i) => shaped(i),
        T::M(k, v) => matches!(&**k, T::S(n) if n == "text") && shaped(v),
        T::Tu(a) | T::U(a) => a.iter().all(shaped),
        T::R(f) => f.iter().all(|(_, t)| shaped(t)),
    }
}

fn covers(a: &T, b: &T) -> bool {
    if key(a) == key(b) {
        return true;
    }
    if matches!(a, T::S(n) if n == "json") && shaped(b) {
        return true;
    }
    match (a, b) {
        (T::L(x), T::L(y)) if covers(x, y) => return true,
        (T::Tu(x), T::Tu(y)) if x.len() == y.len() && x.iter().zip(y).all(|(p, q)| covers(p, q)) => {
            return true
        }
        (T::M(k1, v1), T::M(k2, v2)) if covers(k1, k2) && covers(v1, v2) => return true,
        (T::R(x), T::R(y))
            if x.iter().all(|(n, t)| y.iter().any(|(m, u)| m == n && covers(t, u))) =>
        {
            return true
        }
        _ => {}
    }
    if let T::U(x) = a {
        if x.iter().any(|alt| covers(alt, b)) {
            return true;
        }
    }
    if let T::U(y) = b {
        if y.iter().all(|alt| covers(a, alt)) {
            return true;
        }
    }
    false
}

fn to_val(t: &T) -> Value {
    match t {
        T::S(n) => json!({"k": n}),
        T::U(a) => json!({"k": "union", "alts": a.iter().map(to_val).collect::<Vec<_>>()}),
        T::Tu(a) => json!({"k": "tuple", "items": a.iter().map(to_val).collect::<Vec<_>>()}),
        T::L(i) => json!({"k": "list", "item": to_val(i)}),
        T::M(k, v) => json!({"k": "map", "key": to_val(k), "val": to_val(v)}),
        T::R(f) => json!({"k": "record", "fields": f.iter().map(|(n, t)| json!([n, to_val(t)])).collect::<Vec<_>>()}),
    }
}

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
    fn lit(&mut self, s: &[u8]) -> bool {
        self.ws();
        if self.b[self.i..].starts_with(s) {
            self.i += s.len();
            true
        } else {
            false
        }
    }
    fn expect(&mut self, s: &[u8]) {
        if !self.lit(s) {
            panic!("bad SIG: expected token at {}", self.i);
        }
    }
    fn ident_start(&self) -> bool {
        self.i < self.b.len() && (self.b[self.i].is_ascii_alphabetic() || self.b[self.i] == b'_')
    }
    fn ident(&mut self) -> String {
        self.ws();
        if !self.ident_start() {
            panic!("bad SIG: expected identifier at {}", self.i);
        }
        let s = self.i;
        while self.i < self.b.len() && (self.b[self.i].is_ascii_alphanumeric() || self.b[self.i] == b'_') {
            self.i += 1;
        }
        String::from_utf8(self.b[s..self.i].to_vec()).unwrap()
    }
    fn try_prefix(&mut self, words: &[&str]) -> bool {
        let save = self.i;
        for (n, w) in words.iter().enumerate() {
            self.ws();
            if n > 0 && self.i == save {
                break;
            }
            let before = self.i;
            if !self.ident_start() {
                self.i = save;
                return false;
            }
            let id = self.ident();
            if id != *w {
                self.i = save;
                return false;
            }
            let _ = before;
            let p = self.i;
            self.ws();
            if self.i == p && !(n + 1 == words.len() && false) {
                // whitespace required between words and before the function name
                self.i = save;
                return false;
            }
            if n + 1 == words.len() && !self.ident_start() {
                self.i = save;
                return false;
            }
        }
        true
    }
    fn ty(&mut self, depth: usize) -> T {
        let mut alts = vec![self.alt(depth)];
        loop {
            if !self.lit(b"|") {
                break;
            }
            let a = self.alt(depth);
            if alts.iter().any(|e| covers(e, &a)) {
                panic!("bad SIG: a union alternative is unreachable at {}", self.i);
            }
            alts.push(a);
        }
        if alts.len() == 1 {
            alts.pop().unwrap()
        } else {
            T::U(alts)
        }
    }
    fn alt(&mut self, depth: usize) -> T {
        let id = self.ident();
        match id.as_str() {
            "tuple" | "list" | "map" | "record" => {
                if depth + 1 > 16 {
                    panic!("bad SIG: types nest deeper than 16 at {}", self.i);
                }
                let d = depth + 1;
                self.expect(b"[");
                let r = match id.as_str() {
                    "tuple" => {
                        let mut v = vec![self.ty(d)];
                        while self.lit(b",") {
                            v.push(self.ty(d));
                        }
                        T::Tu(v)
                    }
                    "list" => T::L(Box::new(self.ty(d))),
                    "map" => {
                        let k = self.ty(d);
                        self.expect(b",");
                        let v = self.ty(d);
                        T::M(Box::new(k), Box::new(v))
                    }
                    _ => {
                        let mut f: Vec<(String, T)> = Vec::new();
                        loop {
                            let n = self.ident();
                            self.expect(b":");
                            let t = self.ty(d);
                            if f.iter().any(|(m, _)| *m == n) {
                                panic!("bad SIG: duplicate field");
                            }
                            f.push((n, t));
                            if !self.lit(b",") {
                                break;
                            }
                        }
                        T::R(f)
                    }
                };
                self.expect(b"]");
                r
            }
            s if SCALARS.contains(&s) => T::S(id),
            _ => panic!("bad SIG: unknown type at {}", self.i),
        }
    }
}

pub fn parse_sig(s: &str) -> Value {
    let mut p = P { b: s.as_bytes(), i: 0 };
    if !p.try_prefix(&["pub", "fn"]) {
        p.try_prefix(&["export", "default", "function"]);
    }
    let name = p.ident();
    p.expect(b"(");
    let mut args: Vec<Value> = Vec::new();
    let mut names: Vec<String> = Vec::new();
    let mut rest_seen = false;
    if !p.lit(b")") {
        loop {
            if rest_seen {
                panic!("bad SIG: rest parameter not last");
            }
            let rest = p.lit(b"...");
            let n = p.ident();
            p.expect(b":");
            let t = p.ty(0);
            if names.contains(&n) {
                panic!("bad SIG: duplicate parameter");
            }
            names.push(n.clone());
            let mut m = Map::new();
            m.insert("name".into(), Value::String(n));
            m.insert("type".into(), to_val(&t));
            if rest {
                m.insert("rest".into(), Value::Bool(true));
                rest_seen = true;
            }
            args.push(Value::Object(m));
            if p.lit(b",") {
                continue;
            }
            p.expect(b")");
            break;
        }
    }
    if !p.lit(b"->") {
        p.expect(b":");
    }
    let r = p.ty(0);
    p.ws();
    if p.i != p.b.len() {
        panic!("bad SIG: trailing input at {}", p.i);
    }
    json!({"name": name, "args": args, "result": to_val(&r)})
}
