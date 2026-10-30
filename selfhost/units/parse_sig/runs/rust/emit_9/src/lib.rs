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
            let mut k: Vec<String> = a.iter().map(key).collect();
            k.sort();
            format!("union[{}]", k.join(","))
        }
        T::Tuple(a) => format!("tuple[{}]", a.iter().map(key).collect::<Vec<_>>().join(",")),
        T::List(i) => format!("list[{}]", key(i)),
        T::Map(k, v) => format!("map[{},{}]", key(k), key(v)),
        T::Rec(f) => {
            let mut k: Vec<String> = f.iter().map(|(n, t)| format!("{}={}", n, key(t))).collect();
            k.sort();
            format!("record[{}]", k.join(","))
        }
    }
}

fn shaped(t: &T) -> bool {
    match t {
        T::Sc(s) => matches!(s.as_str(), "none" | "bool" | "f64" | "text" | "json"),
        T::Union(a) | T::Tuple(a) => a.iter().all(shaped),
        T::List(i) => shaped(i),
        T::Map(k, v) => matches!(&**k, T::Sc(s) if s == "text") && shaped(v),
        T::Rec(f) => f.iter().all(|(_, t)| shaped(t)),
    }
}

fn covers(a: &T, b: &T) -> bool {
    if key(a) == key(b) {
        return true;
    }
    if let T::Sc(s) = a {
        if s == "json" && shaped(b) {
            return true;
        }
    }
    let row = match (a, b) {
        (T::List(x), T::List(y)) => covers(x, y),
        (T::Tuple(x), T::Tuple(y)) => {
            x.len() == y.len() && x.iter().zip(y.iter()).all(|(p, q)| covers(p, q))
        }
        (T::Map(k1, v1), T::Map(k2, v2)) => covers(k1, k2) && covers(v1, v2),
        (T::Rec(x), T::Rec(y)) => x
            .iter()
            .all(|(n, t)| y.iter().any(|(m, u)| m == n && covers(t, u))),
        _ => false,
    };
    if row {
        return true;
    }
    if let T::Union(x) = a {
        if x.iter().any(|alt| covers(alt, b)) {
            return true;
        }
    }
    if let T::Union(y) = b {
        if y.iter().all(|alt| covers(a, alt)) {
            return true;
        }
    }
    false
}

fn val(t: &T) -> Value {
    match t {
        T::Sc(s) => json!({ "k": s }),
        T::Union(a) => json!({ "k": "union", "alts": a.iter().map(val).collect::<Vec<_>>() }),
        T::Tuple(a) => json!({ "k": "tuple", "items": a.iter().map(val).collect::<Vec<_>>() }),
        T::List(i) => json!({ "k": "list", "item": val(i) }),
        T::Map(k, v) => json!({ "k": "map", "key": val(k), "val": val(v) }),
        T::Rec(f) => json!({
            "k": "record",
            "fields": f.iter().map(|(n, t)| json!([n, val(t)])).collect::<Vec<_>>()
        }),
    }
}

struct P<'a> {
    b: &'a [u8],
    i: usize,
}

fn bad() -> ! {
    panic!("bad SIG")
}

fn is_start(c: u8) -> bool {
    c.is_ascii_alphabetic() || c == b'_'
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
    fn need(&mut self, s: &[u8]) {
        if !self.lit(s) {
            bad()
        }
    }
    fn ident_opt(&mut self) -> Option<String> {
        self.ws();
        if self.i < self.b.len() && is_start(self.b[self.i]) {
            let st = self.i;
            while self.i < self.b.len() && (self.b[self.i].is_ascii_alphanumeric() || self.b[self.i] == b'_') {
                self.i += 1;
            }
            Some(String::from_utf8_lossy(&self.b[st..self.i]).into_owned())
        } else {
            None
        }
    }
    fn ident(&mut self) -> String {
        match self.ident_opt() {
            Some(s) => s,
            None => bad(),
        }
    }
    fn try_prefix(&mut self, words: &[&str]) -> bool {
        let save = self.i;
        for w in words {
            match self.ident_opt() {
                Some(s) if s == *w => {}
                _ => {
                    self.i = save;
                    return false;
                }
            }
        }
        self.ws();
        if self.i < self.b.len() && is_start(self.b[self.i]) {
            true
        } else {
            self.i = save;
            false
        }
    }
    fn ty(&mut self, d: usize) -> T {
        let mut alts: Vec<T> = vec![self.alt(d)];
        while self.lit(b"|") {
            let a = self.alt(d);
            for e in &alts {
                if covers(e, &a) {
                    bad()
                }
            }
            alts.push(a);
        }
        if alts.len() == 1 {
            alts.pop().unwrap()
        } else {
            T::Union(alts)
        }
    }
    fn alt(&mut self, d: usize) -> T {
        let id = self.ident();
        match id.as_str() {
            "tuple" | "list" | "map" | "record" => {
                let nd = d + 1;
                if nd > 16 {
                    bad()
                }
                self.need(b"[");
                let r = match id.as_str() {
                    "tuple" => {
                        let mut v = vec![self.ty(nd)];
                        while self.lit(b",") {
                            v.push(self.ty(nd));
                        }
                        T::Tuple(v)
                    }
                    "list" => T::List(Box::new(self.ty(nd))),
                    "map" => {
                        let k = self.ty(nd);
                        self.need(b",");
                        let v = self.ty(nd);
                        T::Map(Box::new(k), Box::new(v))
                    }
                    _ => {
                        let mut v: Vec<(String, T)> = Vec::new();
                        loop {
                            let n = self.ident();
                            if v.iter().any(|(m, _)| *m == n) {
                                bad()
                            }
                            self.need(b":");
                            let t = self.ty(nd);
                            v.push((n, t));
                            if !self.lit(b",") {
                                break;
                            }
                        }
                        T::Rec(v)
                    }
                };
                self.need(b"]");
                r
            }
            s if SCALARS.contains(&s) => T::Sc(id),
            _ => bad(),
        }
    }
}

pub fn parse_sig(s: &str) -> Value {
    let mut p = P { b: s.as_bytes(), i: 0 };
    if !p.try_prefix(&["pub", "fn"]) {
        p.try_prefix(&["export", "default", "function"]);
    }
    let name = p.ident();
    p.need(b"(");
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
            p.need(b":");
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
            if p.lit(b",") {
                continue;
            }
            p.need(b")");
            break;
        }
    }
    if !(p.lit(b"->") || p.lit(b":")) {
        bad()
    }
    let r = p.ty(0);
    p.ws();
    if p.i != p.b.len() {
        bad()
    }
    json!({ "name": name, "args": args, "result": val(&r) })
}
