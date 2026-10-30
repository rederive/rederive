use serde_json::{json, Value};

#[derive(Clone, Debug)]
enum Ty {
    Word(String),
    List(Box<Ty>),
    Map(Box<Ty>, Box<Ty>),
    Tuple(Vec<Ty>),
    Record(Vec<(String, Ty)>),
    Union(Vec<Ty>),
}

fn is_ws(c: char) -> bool {
    matches!(c, ' ' | '\t' | '\r' | '\n')
}

fn trim_ws(s: &str) -> &str {
    s.trim_matches(is_ws)
}

fn normalize(s: &str) -> String {
    let t = trim_ws(s);
    if let Some(rest) = t.strip_prefix("map") {
        let run_len: usize = rest.chars().take_while(|c| is_ws(*c)).map(|c| c.len_utf8()).sum();
        if run_len > 0 {
            let after = &rest[run_len..];
            let mut it = after.char_indices();
            if let Some((_, c0)) = it.next() {
                let start = c0.len_utf8();
                if let Some(p) = after[start..].find("->") {
                    let idx = start + p;
                    let k = &after[..idx];
                    let v = &after[idx + 2..];
                    return format!("map[{}, {}]", normalize(k), normalize(v));
                }
            }
        }
    }
    t.to_string()
}

fn widen(s: &str) -> String {
    let ch: Vec<char> = s.chars().collect();
    let n = ch.len();
    let mut out = String::new();
    let mut i = 0;
    while i < n {
        let mut done = false;
        if i + 2 <= n && (ch[i] == 'u' || ch[i] == 'i') {
            let w: String = ch[i..(i + 3).min(n)].iter().collect();
            let w2: String = ch[i..(i + 2).min(n)].iter().collect();
            let (spell_len, repl) = if matches!(w.as_str(), "u16" | "u32" | "i16" | "i32") {
                (3, if ch[i] == 'u' { "u64" } else { "i64" })
            } else if matches!(w2.as_str(), "u8" | "i8") {
                (2, if ch[i] == 'u' { "u64" } else { "i64" })
            } else {
                (0, "")
            };
            if spell_len > 0 {
                let mut l = i;
                let left_ok = loop {
                    if l == 0 {
                        break true;
                    }
                    l -= 1;
                    if !is_ws(ch[l]) {
                        break matches!(ch[l], '[' | ',' | '|' | ':');
                    }
                };
                let mut r = i + spell_len;
                while r < n && is_ws(ch[r]) {
                    r += 1;
                }
                let right_ok = r >= n || matches!(ch[r], ']' | ',' | '|');
                if left_ok && right_ok {
                    out.push_str(repl);
                    i += spell_len;
                    done = true;
                }
            }
        }
        if !done {
            out.push(ch[i]);
            i += 1;
        }
    }
    out
}

fn same(a: &Ty, b: &Ty) -> bool {
    match (a, b) {
        (Ty::Word(x), Ty::Word(y)) => x == y,
        (Ty::List(x), Ty::List(y)) => same(x, y),
        (Ty::Map(k1, v1), Ty::Map(k2, v2)) => same(k1, k2) && same(v1, v2),
        (Ty::Tuple(x), Ty::Tuple(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q)),
        (Ty::Record(x), Ty::Record(y)) => {
            x.iter().all(|(n, t)| y.iter().any(|(m, u)| n == m && same(t, u)))
                && y.iter().all(|(m, u)| x.iter().any(|(n, t)| n == m && same(t, u)))
        }
        (Ty::Union(x), Ty::Union(y)) => {
            x.iter().all(|p| y.iter().any(|q| same(p, q))) && y.iter().all(|q| x.iter().any(|p| same(p, q)))
        }
        _ => false,
    }
}

fn jsonable(t: &Ty) -> bool {
    match t {
        Ty::Word(w) => matches!(w.as_str(), "none" | "bool" | "f64" | "text" | "json"),
        Ty::List(x) => jsonable(x),
        Ty::Tuple(x) => x.iter().all(jsonable),
        Ty::Map(k, v) => matches!(&**k, Ty::Word(w) if w == "text") && jsonable(v),
        Ty::Record(f) => f.iter().all(|(_, t)| jsonable(t)),
        Ty::Union(x) => x.iter().all(jsonable),
    }
}

fn covers(a: &Ty, b: &Ty) -> bool {
    if same(a, b) {
        return true;
    }
    if matches!(a, Ty::Word(w) if w == "json") && jsonable(b) {
        return true;
    }
    match (a, b) {
        (Ty::List(x), Ty::List(y)) if covers(x, y) => return true,
        (Ty::Tuple(x), Ty::Tuple(y))
            if x.len() == y.len() && x.iter().zip(y).all(|(p, q)| covers(p, q)) =>
        {
            return true
        }
        (Ty::Map(k1, v1), Ty::Map(k2, v2)) if covers(k1, k2) && covers(v1, v2) => return true,
        (Ty::Record(x), Ty::Record(y))
            if x.iter().all(|(n, f)| y.iter().any(|(m, g)| n == m && covers(f, g))) =>
        {
            return true
        }
        _ => {}
    }
    if let Ty::Union(x) = a {
        if x.iter().any(|p| covers(p, b)) {
            return true;
        }
    }
    if let Ty::Union(y) = b {
        if y.iter().all(|q| covers(a, q)) {
            return true;
        }
    }
    false
}

struct P {
    c: Vec<char>,
    i: usize,
    depth: usize,
}

impl P {
    fn ws(&mut self) {
        while self.i < self.c.len() && is_ws(self.c[self.i]) {
            self.i += 1;
        }
    }
    fn eat(&mut self, ch: char) {
        self.ws();
        if self.i < self.c.len() && self.c[self.i] == ch {
            self.i += 1;
        } else {
            panic!("expected {}", ch);
        }
    }
    fn ident(&mut self) -> String {
        self.ws();
        let st = self.i;
        if self.i < self.c.len() && (self.c[self.i].is_ascii_alphabetic() || self.c[self.i] == '_') {
            while self.i < self.c.len() && (self.c[self.i].is_ascii_alphanumeric() || self.c[self.i] == '_') {
                self.i += 1;
            }
        } else {
            panic!("expected an identifier");
        }
        self.c[st..self.i].iter().collect()
    }
    fn peek(&mut self, ch: char) -> bool {
        self.ws();
        self.i < self.c.len() && self.c[self.i] == ch
    }
    fn open(&mut self) {
        self.depth += 1;
        if self.depth > 16 {
            panic!("too deep");
        }
        self.eat('[');
    }
    fn close(&mut self) {
        self.eat(']');
        self.depth -= 1;
    }
    fn ty(&mut self) -> Ty {
        let mut alts = vec![self.alt()];
        while self.peek('|') {
            self.i += 1;
            alts.push(self.alt());
        }
        if alts.len() == 1 {
            return alts.pop().unwrap();
        }
        for i in 0..alts.len() {
            for j in i + 1..alts.len() {
                if covers(&alts[i], &alts[j]) {
                    panic!("unreachable alternative");
                }
            }
        }
        Ty::Union(alts)
    }
    fn alt(&mut self) -> Ty {
        let w = self.ident();
        match w.as_str() {
            "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" => Ty::Word(w),
            "list" => {
                self.open();
                let t = self.ty();
                self.close();
                Ty::List(Box::new(t))
            }
            "map" => {
                self.open();
                let k = self.ty();
                self.eat(',');
                let v = self.ty();
                self.close();
                Ty::Map(Box::new(k), Box::new(v))
            }
            "tuple" => {
                self.open();
                let mut items = vec![self.ty()];
                while self.peek(',') {
                    self.i += 1;
                    items.push(self.ty());
                }
                self.close();
                Ty::Tuple(items)
            }
            "record" => {
                self.open();
                let mut fields: Vec<(String, Ty)> = Vec::new();
                loop {
                    let n = self.ident();
                    if fields.iter().any(|(m, _)| *m == n) {
                        panic!("duplicate field");
                    }
                    self.eat(':');
                    let t = self.ty();
                    fields.push((n, t));
                    if self.peek(',') {
                        self.i += 1;
                    } else {
                        break;
                    }
                }
                self.close();
                Ty::Record(fields)
            }
            _ => panic!("unknown word"),
        }
    }
}

fn to_json(t: &Ty) -> Value {
    match t {
        Ty::Word(w) => json!({"k": w}),
        Ty::List(x) => json!({"k": "list", "item": to_json(x)}),
        Ty::Map(k, v) => json!({"k": "map", "key": to_json(k), "val": to_json(v)}),
        Ty::Tuple(x) => json!({"k": "tuple", "items": x.iter().map(to_json).collect::<Vec<_>>()}),
        Ty::Record(f) => {
            json!({"k": "record", "fields": f.iter().map(|(n, t)| json!([n, to_json(t)])).collect::<Vec<_>>()})
        }
        Ty::Union(x) => json!({"k": "union", "alts": x.iter().map(to_json).collect::<Vec<_>>()}),
    }
}

pub fn carried_shape_type(shape: &str) -> serde_json::Value {
    let seg = shape.split(';').next().unwrap_or("");
    let text = widen(&normalize(seg));
    let mut p = P { c: text.chars().collect(), i: 0, depth: 0 };
    let t = p.ty();
    p.ws();
    if p.i != p.c.len() {
        panic!("trailing text");
    }
    to_json(&t)
}
