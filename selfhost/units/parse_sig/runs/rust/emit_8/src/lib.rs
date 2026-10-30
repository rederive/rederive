use serde_json::{json, Map, Value};

enum T {
    Sc(String),
    Union(Vec<T>),
    Tuple(Vec<T>),
    List(Box<T>),
    Map(Box<T>, Box<T>),
    Rec(Vec<(String, T)>),
}

const SCALARS: [&str; 8] = ["text", "bytes", "bool", "none", "i64", "u64", "f64", "json"];

fn key(t: &T) -> String {
    match t {
        T::Sc(s) => s.clone(),
        T::Union(a) => {
            let mut v: Vec<String> = a.iter().map(key).collect();
            v.sort();
            format!("U[{}]", v.join(","))
        }
        T::Tuple(a) => format!("T[{}]", a.iter().map(key).collect::<Vec<_>>().join(",")),
        T::List(a) => format!("L[{}]", key(a)),
        T::Map(k, v) => format!("M[{},{}]", key(k), key(v)),
        T::Rec(f) => {
            let mut v: Vec<String> = f.iter().map(|(n, t)| format!("{}={}", n, key(t))).collect();
            v.sort();
            format!("R[{}]", v.join(","))
        }
    }
}

fn shaped(t: &T) -> bool {
    match t {
        T::Sc(s) => matches!(s.as_str(), "none" | "bool" | "f64" | "text" | "json"),
        T::List(a) => shaped(a),
        T::Map(k, v) => matches!(&**k, T::Sc(s) if s == "text") && shaped(v),
        T::Tuple(a) | T::Union(a) => a.iter().all(shaped),
        T::Rec(f) => f.iter().all(|(_, t)| shaped(t)),
    }
}

fn covers(a: &T, b: &T) -> bool {
    if key(a) == key(b) {
        return true;
    }
    if matches!(a, T::Sc(s) if s == "json") && shaped(b) {
        return true;
    }
    match (a, b) {
        (T::List(x), T::List(y)) if covers(x, y) => return true,
        (T::Tuple(x), T::Tuple(y)) if x.len() == y.len() && x.iter().zip(y).all(|(p, q)| covers(p, q)) => {
            return true
        }
        (T::Map(k1, v1), T::Map(k2, v2)) if covers(k1, k2) && covers(v1, v2) => return true,
        (T::Rec(x), T::Rec(y))
            if x.iter().all(|(n, t)| y.iter().any(|(m, u)| m == n && covers(t, u))) =>
        {
            return true
        }
        _ => {}
    }
    if let T::Union(x) = a {
        if x.iter().any(|p| covers(p, b)) {
            return true;
        }
    }
    if let T::Union(y) = b {
        if y.iter().all(|q| covers(a, q)) {
            return true;
        }
    }
    false
}

struct P<'a> {
    b: &'a [u8],
    i: usize,
}

fn bad() -> ! {
    panic!("bad SIG")
}

impl<'a> P<'a> {
    fn ws(&mut self) {
        while self.i < self.b.len() && matches!(self.b[self.i], b' ' | b'\t' | b'\r' | b'\n') {
            self.i += 1;
        }
    }
    fn lit(&mut self, l: &[u8]) -> bool {
        self.ws();
        if self.b[self.i..].starts_with(l) {
            self.i += l.len();
            true
        } else {
            false
        }
    }
    fn expect(&mut self, l: &[u8]) {
        if !self.lit(l) {
            bad()
        }
    }
    fn ident_start(&self) -> bool {
        self.i < self.b.len() && (self.b[self.i].is_ascii_alphabetic() || self.b[self.i] == b'_')
    }
    fn ident(&mut self) -> String {
        self.ws();
        if !self.ident_start() {
            bad()
        }
        let s = self.i;
        while self.i < self.b.len() && (self.b[self.i].is_ascii_alphanumeric() || self.b[self.i] == b'_') {
            self.i += 1;
        }
        String::from_utf8_lossy(&self.b[s..self.i]).into_owned()
    }
    fn prefix(&mut self) {
        let save = self.i;
        for words in [&["pub", "fn"][..], &["export", "default", "function"][..]] {
            self.i = save;
            let mut ok = true;
            for w in words {
                self.ws();
                if !self.ident_start() {
                    ok = false;
                    break;
                }
                if self.ident() != *w {
                    ok = false;
                    break;
                }
            }
            if ok {
                self.ws();
                if self.ident_start() {
                    return;
                }
            }
        }
        self.i = save;
    }
    fn ty(&mut self, depth: usize) -> T {
        let mut alts: Vec<T> = Vec::new();
        loop {
            let a = self.alt(depth);
            for e in &alts {
                if covers(e, &a) {
                    bad()
                }
            }
            alts.push(a);
            if !self.lit(b"|") {
                break;
            }
        }
        if alts.len() == 1 {
            alts.pop().unwrap()
        } else {
            T::Union(alts)
        }
    }
    fn alt(&mut self, depth: usize) -> T {
        let id = self.ident();
        let comp = matches!(id.as_str(), "tuple" | "list" | "map" | "record");
        if !comp {
            if SCALARS.contains(&id.as_str()) {
                return T::Sc(id);
            }
            bad()
        }
        if depth + 1 > 16 {
            bad()
        }
        let d = depth + 1;
        self.expect(b"[");
        let r = match id.as_str() {
            "tuple" => {
                let mut v = vec![self.ty(d)];
                while self.lit(b",") {
                    v.push(self.ty(d));
                }
                T::Tuple(v)
            }
            "list" => T::List(Box::new(self.ty(d))),
            "map" => {
                let k = self.ty(d);
                self.expect(b",");
                let v = self.ty(d);
                T::Map(Box::new(k), Box::new(v))
            }
            _ => {
                let mut f: Vec<(String, T)> = Vec::new();
                loop {
                    let n = self.ident();
                    if f.iter().any(|(m, _)| *m == n) {
                        bad()
                    }
                    self.expect(b":");
                    let t = self.ty(d);
                    f.push((n, t));
                    if !self.lit(b",") {
                        break;
                    }
                }
                T::Rec(f)
            }
        };
        self.expect(b"]");
        r
    }
}

fn val(t: &T) -> Value {
    match t {
        T::Sc(s) => json!({"k": s}),
        T::Union(a) => json!({"k": "union", "alts": a.iter().map(val).collect::<Vec<_>>()}),
        T::Tuple(a) => json!({"k": "tuple", "items": a.iter().map(val).collect::<Vec<_>>()}),
        T::List(a) => json!({"k": "list", "item": val(a)}),
        T::Map(k, v) => json!({"k": "map", "key": val(k), "val": val(v)}),
        T::Rec(f) => json!({"k": "record", "fields": f.iter().map(|(n, t)| json!([n, val(t)])).collect::<Vec<_>>()}),
    }
}

pub fn parse_sig(s: &str) -> Value {
    let mut p = P { b: s.as_bytes(), i: 0 };
    p.prefix();
    let name = p.ident();
    p.expect(b"(");
    let mut args: Vec<Value> = Vec::new();
    let mut names: Vec<String> = Vec::new();
    let mut rest_seen = false;
    if !p.lit(b")") {
        loop {
            if rest_seen {
                bad()
            }
            let rest = p.lit(b"...");
            let n = p.ident();
            if names.contains(&n) {
                bad()
            }
            p.expect(b":");
            let t = p.ty(0);
            let mut m = Map::new();
            m.insert("name".into(), Value::String(n.clone()));
            m.insert("type".into(), val(&t));
            if rest {
                m.insert("rest".into(), Value::Bool(true));
                rest_seen = true;
            }
            names.push(n);
            args.push(Value::Object(m));
            if !p.lit(b",") {
                break;
            }
        }
        p.expect(b")");
    }
    if !(p.lit(b"->") || p.lit(b":")) {
        bad()
    }
    let r = p.ty(0);
    p.ws();
    if p.i != p.b.len() {
        bad()
    }
    json!({"name": name, "args": args, "result": val(&r)})
}
