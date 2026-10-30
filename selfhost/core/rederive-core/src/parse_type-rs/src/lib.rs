use serde_json::{json, Value};

const MAX_DEPTH: usize = 16;

enum N {
    S(String),
    Tuple(Vec<N>),
    List(Box<N>),
    Map(Box<N>, Box<N>),
    Record(Vec<(String, N)>),
    Union(Vec<N>),
}

fn same(a: &N, b: &N) -> bool {
    match (a, b) {
        (N::S(x), N::S(y)) => x == y,
        (N::Tuple(x), N::Tuple(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q)),
        (N::List(x), N::List(y)) => same(x, y),
        (N::Map(k1, v1), N::Map(k2, v2)) => same(k1, k2) && same(v1, v2),
        (N::Record(x), N::Record(y)) => {
            x.len() == y.len()
                && x.iter().all(|(n, t)| y.iter().any(|(m, u)| n == m && same(t, u)))
        }
        (N::Union(x), N::Union(y)) => {
            x.iter().all(|p| y.iter().any(|q| same(p, q)))
                && y.iter().all(|q| x.iter().any(|p| same(p, q)))
        }
        _ => false,
    }
}

fn shaped(n: &N) -> bool {
    match n {
        N::S(k) => matches!(k.as_str(), "none" | "bool" | "f64" | "text" | "json"),
        N::List(i) => shaped(i),
        N::Tuple(v) => v.iter().all(shaped),
        N::Map(k, v) => matches!(&**k, N::S(s) if s == "text") && shaped(v),
        N::Record(f) => f.iter().all(|(_, t)| shaped(t)),
        N::Union(v) => v.iter().all(shaped),
    }
}

fn covers(e: &N, l: &N) -> bool {
    if same(e, l) {
        return true;
    }
    if matches!(e, N::S(k) if k == "json") && shaped(l) {
        return true;
    }
    let structural = match (e, l) {
        (N::List(a), N::List(b)) => covers(a, b),
        (N::Tuple(a), N::Tuple(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(p, q)| covers(p, q))
        }
        (N::Map(k1, v1), N::Map(k2, v2)) => covers(k1, k2) && covers(v1, v2),
        (N::Record(a), N::Record(b)) => a
            .iter()
            .all(|(n, t)| b.iter().any(|(m, u)| n == m && covers(t, u))),
        _ => false,
    };
    if structural {
        return true;
    }
    if let N::Union(a) = e {
        if a.iter().any(|x| covers(x, l)) {
            return true;
        }
    }
    if let N::Union(b) = l {
        if b.iter().all(|y| covers(e, y)) {
            return true;
        }
    }
    false
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

    fn peek(&self) -> Option<u8> {
        self.b.get(self.i).copied()
    }

    fn expect(&mut self, c: u8) {
        self.ws();
        if self.peek() != Some(c) {
            panic!("expected {}", c as char);
        }
        self.i += 1;
    }

    fn name(&mut self) -> String {
        self.ws();
        let s = self.i;
        if let Some(c) = self.peek() {
            if c.is_ascii_alphabetic() || c == b'_' {
                self.i += 1;
                while let Some(c) = self.peek() {
                    if c.is_ascii_alphanumeric() || c == b'_' {
                        self.i += 1;
                    } else {
                        break;
                    }
                }
            }
        }
        if self.i == s {
            panic!("expected an identifier");
        }
        String::from_utf8(self.b[s..self.i].to_vec()).unwrap()
    }

    fn ty(&mut self, depth: usize) -> N {
        let mut alts = vec![self.alt(depth)];
        loop {
            self.ws();
            if self.peek() == Some(b'|') {
                self.i += 1;
                alts.push(self.alt(depth));
            } else {
                break;
            }
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
        N::Union(alts)
    }

    fn alt(&mut self, depth: usize) -> N {
        let name = self.name();
        match name.as_str() {
            "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" => N::S(name),
            "tuple" | "list" | "map" | "record" => {
                self.expect(b'[');
                if depth + 1 > MAX_DEPTH {
                    panic!("types nest too deep");
                }
                let d = depth + 1;
                if name == "record" {
                    let mut fields: Vec<(String, N)> = Vec::new();
                    loop {
                        let f = self.name();
                        if fields.iter().any(|(n, _)| *n == f) {
                            panic!("duplicate field");
                        }
                        self.expect(b':');
                        let t = self.ty(d);
                        fields.push((f, t));
                        self.ws();
                        match self.peek() {
                            Some(b',') => self.i += 1,
                            Some(b']') => {
                                self.i += 1;
                                break;
                            }
                            _ => panic!("expected , or ]"),
                        }
                    }
                    return N::Record(fields);
                }
                let mut parts = Vec::new();
                loop {
                    parts.push(self.ty(d));
                    self.ws();
                    match self.peek() {
                        Some(b',') => self.i += 1,
                        Some(b']') => {
                            self.i += 1;
                            break;
                        }
                        _ => panic!("expected , or ]"),
                    }
                }
                match name.as_str() {
                    "tuple" => N::Tuple(parts),
                    "list" => {
                        if parts.len() != 1 {
                            panic!("list takes one");
                        }
                        N::List(Box::new(parts.pop().unwrap()))
                    }
                    _ => {
                        if parts.len() != 2 {
                            panic!("map takes two");
                        }
                        let v = parts.pop().unwrap();
                        let k = parts.pop().unwrap();
                        N::Map(Box::new(k), Box::new(v))
                    }
                }
            }
            _ => panic!("unknown abstract type"),
        }
    }
}

fn to_value(n: &N) -> Value {
    match n {
        N::S(k) => json!({ "k": k }),
        N::Tuple(v) => json!({ "k": "tuple", "items": v.iter().map(to_value).collect::<Vec<_>>() }),
        N::List(i) => json!({ "k": "list", "item": to_value(i) }),
        N::Map(k, v) => json!({ "k": "map", "key": to_value(k), "val": to_value(v) }),
        N::Record(f) => json!({
            "k": "record",
            "fields": f.iter().map(|(n, t)| json!([n, to_value(t)])).collect::<Vec<_>>()
        }),
        N::Union(v) => json!({ "k": "union", "alts": v.iter().map(to_value).collect::<Vec<_>>() }),
    }
}

pub fn parse_type(s: &str) -> serde_json::Value {
    let mut p = P { b: s.as_bytes(), i: 0 };
    let n = p.ty(0);
    p.ws();
    if p.i != p.b.len() {
        panic!("unexpected text");
    }
    to_value(&n)
}
