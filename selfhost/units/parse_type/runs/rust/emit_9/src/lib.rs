use serde_json::{json, Value};

const MAX_DEPTH: usize = 16;

enum N {
    Sc(&'static str),
    Union(Vec<N>),
    Tuple(Vec<N>),
    List(Box<N>),
    Map(Box<N>, Box<N>),
    Rec(Vec<(String, N)>),
}

fn same(a: &N, b: &N) -> bool {
    match (a, b) {
        (N::Sc(x), N::Sc(y)) => x == y,
        (N::Tuple(x), N::Tuple(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q)),
        (N::List(x), N::List(y)) => same(x, y),
        (N::Map(k1, v1), N::Map(k2, v2)) => same(k1, k2) && same(v1, v2),
        (N::Rec(x), N::Rec(y)) => {
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
        N::Sc(s) => matches!(*s, "none" | "bool" | "f64" | "text" | "json"),
        N::List(i) => shaped(i),
        N::Tuple(v) => v.iter().all(shaped),
        N::Map(k, v) => matches!(**k, N::Sc("text")) && shaped(v),
        N::Rec(f) => f.iter().all(|(_, t)| shaped(t)),
        N::Union(v) => v.iter().all(shaped),
    }
}

fn covers(e: &N, l: &N) -> bool {
    if same(e, l) {
        return true;
    }
    if matches!(e, N::Sc("json")) && shaped(l) {
        return true;
    }
    let structural = match (e, l) {
        (N::List(a), N::List(b)) => covers(a, b),
        (N::Tuple(a), N::Tuple(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(p, q)| covers(p, q))
        }
        (N::Map(k1, v1), N::Map(k2, v2)) => covers(k1, k2) && covers(v1, v2),
        (N::Rec(a), N::Rec(b)) => a
            .iter()
            .all(|(n, t)| b.iter().any(|(m, u)| n == m && covers(t, u))),
        _ => false,
    };
    if structural {
        return true;
    }
    if let N::Union(v) = e {
        if v.iter().any(|x| covers(x, l)) {
            return true;
        }
    }
    if let N::Union(v) = l {
        if v.iter().all(|x| covers(e, x)) {
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

    fn name(&mut self) -> String {
        let st = self.i;
        if self.i < self.b.len() && (self.b[self.i].is_ascii_alphabetic() || self.b[self.i] == b'_') {
            self.i += 1;
            while self.i < self.b.len() && (self.b[self.i].is_ascii_alphanumeric() || self.b[self.i] == b'_') {
                self.i += 1;
            }
        } else {
            panic!("expected an identifier");
        }
        String::from_utf8(self.b[st..self.i].to_vec()).unwrap()
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

    fn ty(&mut self, depth: usize) -> N {
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
                    panic!("unreachable alternative");
                }
            }
        }
        N::Union(alts)
    }

    fn alt(&mut self, depth: usize) -> N {
        self.ws();
        let nm = self.name();
        let sc: Option<&'static str> = match nm.as_str() {
            "text" => Some("text"),
            "bytes" => Some("bytes"),
            "bool" => Some("bool"),
            "none" => Some("none"),
            "i64" => Some("i64"),
            "u64" => Some("u64"),
            "f64" => Some("f64"),
            "json" => Some("json"),
            _ => None,
        };
        if let Some(s) = sc {
            return N::Sc(s);
        }
        if !matches!(nm.as_str(), "tuple" | "list" | "map" | "record") {
            panic!("unknown abstract type");
        }
        if !self.eat(b'[') {
            panic!("expected [");
        }
        if depth + 1 > MAX_DEPTH {
            panic!("types nest too deep");
        }
        let d = depth + 1;
        if nm == "record" {
            let mut fields: Vec<(String, N)> = Vec::new();
            loop {
                self.ws();
                let f = self.name();
                if fields.iter().any(|(n, _)| *n == f) {
                    panic!("duplicate field");
                }
                if !self.eat(b':') {
                    panic!("expected :");
                }
                let t = self.ty(d);
                fields.push((f, t));
                if self.eat(b',') {
                    continue;
                }
                if self.eat(b']') {
                    break;
                }
                panic!("expected , or ]");
            }
            return N::Rec(fields);
        }
        let mut parts: Vec<N> = Vec::new();
        loop {
            parts.push(self.ty(d));
            if self.eat(b',') {
                continue;
            }
            if self.eat(b']') {
                break;
            }
            panic!("expected , or ]");
        }
        match nm.as_str() {
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
}

fn render(n: &N) -> Value {
    match n {
        N::Sc(s) => json!({ "k": s }),
        N::Union(v) => json!({ "k": "union", "alts": v.iter().map(render).collect::<Vec<_>>() }),
        N::Tuple(v) => json!({ "k": "tuple", "items": v.iter().map(render).collect::<Vec<_>>() }),
        N::List(i) => json!({ "k": "list", "item": render(i) }),
        N::Map(k, v) => json!({ "k": "map", "key": render(k), "val": render(v) }),
        N::Rec(f) => json!({
            "k": "record",
            "fields": f.iter().map(|(n, t)| json!([n, render(t)])).collect::<Vec<_>>()
        }),
    }
}

pub fn parse_type(s: &str) -> serde_json::Value {
    let mut p = P { b: s.as_bytes(), i: 0 };
    let n = p.ty(0);
    p.ws();
    if p.i != p.b.len() {
        panic!("unexpected text");
    }
    render(&n)
}
