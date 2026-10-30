use serde_json::{json, Value};

fn is_ws(c: char) -> bool {
    matches!(c, ' ' | '\t' | '\r' | '\n')
}

fn normalize(s: &str) -> String {
    let t = s.trim_matches(is_ws);
    if let Some(rest) = t.strip_prefix("map") {
        let run: usize = rest.chars().take_while(|&c| is_ws(c)).map(|c| c.len_utf8()).sum();
        if run >= 1 {
            let run_end = 3 + run;
            if let Some(fc) = t[run_end..].chars().next() {
                let from = run_end + fc.len_utf8();
                if let Some(off) = t[from..].find("->") {
                    let at = from + off;
                    let k = &t[run_end..at];
                    let v = &t[at + 2..];
                    return format!("map[{}, {}]", normalize(k), normalize(v));
                }
            }
        }
    }
    t.to_string()
}

fn widen(text: &str) -> String {
    let cs: Vec<char> = text.chars().collect();
    let mut out = String::new();
    let words: [(&str, &str); 6] = [
        ("u8", "u64"),
        ("u16", "u64"),
        ("u32", "u64"),
        ("i8", "i64"),
        ("i16", "i64"),
        ("i32", "i64"),
    ];
    let mut i = 0;
    while i < cs.len() {
        let mut hit = false;
        for (w, r) in words.iter() {
            let wc: Vec<char> = w.chars().collect();
            let n = wc.len();
            if i + n <= cs.len() && cs[i..i + n] == wc[..] {
                let mut l = i;
                while l > 0 && is_ws(cs[l - 1]) {
                    l -= 1;
                }
                let left_ok = l == 0 || matches!(cs[l - 1], '[' | ',' | '|' | ':');
                let mut r2 = i + n;
                while r2 < cs.len() && is_ws(cs[r2]) {
                    r2 += 1;
                }
                let right_ok = r2 == cs.len() || matches!(cs[r2], ']' | ',' | '|');
                if left_ok && right_ok {
                    out.push_str(r);
                    i += n;
                    hit = true;
                    break;
                }
            }
        }
        if !hit {
            out.push(cs[i]);
            i += 1;
        }
    }
    out
}

#[derive(Clone)]
enum T {
    W(String),
    List(Box<T>),
    Map(Box<T>, Box<T>),
    Tuple(Vec<T>),
    Rec(Vec<(String, T)>),
    Union(Vec<T>),
}

fn same(a: &T, b: &T) -> bool {
    match (a, b) {
        (T::W(x), T::W(y)) => x == y,
        (T::List(x), T::List(y)) => same(x, y),
        (T::Map(k1, v1), T::Map(k2, v2)) => same(k1, k2) && same(v1, v2),
        (T::Tuple(x), T::Tuple(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q)),
        (T::Rec(x), T::Rec(y)) => {
            x.len() == y.len()
                && x.iter().all(|(n, t)| y.iter().any(|(m, u)| n == m && same(t, u)))
                && y.iter().all(|(n, t)| x.iter().any(|(m, u)| n == m && same(t, u)))
        }
        (T::Union(x), T::Union(y)) => {
            x.iter().all(|p| y.iter().any(|q| same(p, q))) && y.iter().all(|q| x.iter().any(|p| same(p, q)))
        }
        _ => false,
    }
}

fn jsonable(t: &T) -> bool {
    match t {
        T::W(w) => matches!(w.as_str(), "none" | "bool" | "f64" | "text" | "json"),
        T::List(x) => jsonable(x),
        T::Tuple(x) => x.iter().all(jsonable),
        T::Map(k, v) => matches!(&**k, T::W(w) if w == "text") && jsonable(v),
        T::Rec(f) => f.iter().all(|(_, t)| jsonable(t)),
        T::Union(x) => x.iter().all(jsonable),
    }
}

fn covers(a: &T, b: &T) -> bool {
    if same(a, b) {
        return true;
    }
    if matches!(a, T::W(w) if w == "json") && jsonable(b) {
        return true;
    }
    match (a, b) {
        (T::List(x), T::List(y)) if covers(x, y) => return true,
        (T::Tuple(x), T::Tuple(y)) if x.len() == y.len() && x.iter().zip(y).all(|(p, q)| covers(p, q)) => {
            return true
        }
        (T::Map(k1, v1), T::Map(k2, v2)) if covers(k1, k2) && covers(v1, v2) => return true,
        (T::Rec(x), T::Rec(y))
            if x.iter().all(|(n, f)| y.iter().any(|(m, g)| n == m && covers(f, g))) =>
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

struct P {
    c: Vec<char>,
    i: usize,
}

impl P {
    fn ws(&mut self) {
        while self.i < self.c.len() && is_ws(self.c[self.i]) {
            self.i += 1;
        }
    }
    fn ident(&mut self) -> String {
        self.ws();
        let st = self.i;
        if self.i < self.c.len() && (self.c[self.i].is_ascii_alphabetic() || self.c[self.i] == '_') {
            self.i += 1;
            while self.i < self.c.len() && (self.c[self.i].is_ascii_alphanumeric() || self.c[self.i] == '_') {
                self.i += 1;
            }
        } else {
            panic!("expected an identifier");
        }
        self.c[st..self.i].iter().collect()
    }
    fn expect(&mut self, ch: char) {
        self.ws();
        if self.i < self.c.len() && self.c[self.i] == ch {
            self.i += 1;
        } else {
            panic!("expected {}", ch);
        }
    }
    fn peek(&mut self) -> Option<char> {
        self.ws();
        self.c.get(self.i).copied()
    }
    fn ty(&mut self, depth: usize) -> T {
        let mut alts = vec![self.alt(depth)];
        while self.peek() == Some('|') {
            self.i += 1;
            alts.push(self.alt(depth));
        }
        if alts.len() == 1 {
            return alts.pop().unwrap();
        }
        for i in 0..alts.len() {
            for j in i + 1..alts.len() {
                if covers(&alts[i], &alts[j]) {
                    panic!("a union alternative is unreachable");
                }
            }
        }
        T::Union(alts)
    }
    fn open(&mut self, depth: usize) -> usize {
        if depth + 1 > 16 {
            panic!("types nest deeper than 16");
        }
        self.expect('[');
        depth + 1
    }
    fn alt(&mut self, depth: usize) -> T {
        let w = self.ident();
        match w.as_str() {
            "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" => T::W(w),
            "list" => {
                let d = self.open(depth);
                let x = self.ty(d);
                self.expect(']');
                T::List(Box::new(x))
            }
            "map" => {
                let d = self.open(depth);
                let k = self.ty(d);
                self.expect(',');
                let v = self.ty(d);
                self.expect(']');
                T::Map(Box::new(k), Box::new(v))
            }
            "tuple" => {
                let d = self.open(depth);
                let mut items = vec![self.ty(d)];
                while self.peek() == Some(',') {
                    self.i += 1;
                    items.push(self.ty(d));
                }
                self.expect(']');
                T::Tuple(items)
            }
            "record" => {
                let d = self.open(depth);
                let mut fields: Vec<(String, T)> = Vec::new();
                loop {
                    let n = self.ident();
                    if fields.iter().any(|(m, _)| *m == n) {
                        panic!("duplicate field");
                    }
                    self.expect(':');
                    let t = self.ty(d);
                    fields.push((n, t));
                    if self.peek() == Some(',') {
                        self.i += 1;
                    } else {
                        break;
                    }
                }
                self.expect(']');
                T::Rec(fields)
            }
            _ => panic!("unknown type word"),
        }
    }
}

fn node(t: &T) -> Value {
    match t {
        T::W(w) => json!({ "k": w }),
        T::List(x) => json!({ "k": "list", "item": node(x) }),
        T::Map(k, v) => json!({ "k": "map", "key": node(k), "val": node(v) }),
        T::Tuple(x) => json!({ "k": "tuple", "items": x.iter().map(node).collect::<Vec<_>>() }),
        T::Rec(f) => json!({
            "k": "record",
            "fields": f.iter().map(|(n, t)| json!([n, node(t)])).collect::<Vec<_>>()
        }),
        T::Union(x) => json!({ "k": "union", "alts": x.iter().map(node).collect::<Vec<_>>() }),
    }
}

pub fn carried_shape_type(shape: &str) -> serde_json::Value {
    let seg = shape.split(';').next().unwrap_or("");
    let text = widen(&normalize(seg));
    let mut p = P { c: text.chars().collect(), i: 0 };
    let t = p.ty(0);
    p.ws();
    if p.i != p.c.len() {
        panic!("trailing text");
    }
    node(&t)
}
