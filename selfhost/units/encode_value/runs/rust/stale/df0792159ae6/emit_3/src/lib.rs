use serde_json::{Map, Value};
use std::borrow::Cow;

#[derive(Clone)]
enum V {
    Absent,
    None,
    Bool(bool),
    Num(f64),
    Int(Option<i128>),
    Text(String),
    Bad,
    List(Vec<V>),
    Map(Vec<(String, V)>, bool),
}

enum T {
    Text,
    Bytes,
    Bool,
    None,
    I64,
    U64,
    F64,
    Json,
    Tuple(Vec<T>),
    List(Box<T>),
    Map(Box<T>, Box<T>),
    Record(Vec<(String, T)>),
    Union(Vec<T>),
}

type R<X> = Result<X, ()>;

fn from_json(v: &Value) -> V {
    match v {
        Value::Null => V::None,
        Value::Bool(b) => V::Bool(*b),
        Value::Number(n) => V::Num(n.as_f64().unwrap_or(f64::NAN)),
        Value::String(s) => V::Text(s.clone()),
        Value::Array(a) => V::List(a.iter().map(from_json).collect()),
        Value::Object(o) => V::Map(o.iter().map(|(k, x)| (k.clone(), from_json(x))).collect(), false),
    }
}

struct P<'a> {
    s: &'a [u8],
    i: usize,
}

impl<'a> P<'a> {
    fn ws(&mut self) {
        while self.i < self.s.len() && matches!(self.s[self.i], b' ' | b'\t' | b'\r' | b'\n') {
            self.i += 1;
        }
    }
    fn peek(&self) -> Option<u8> {
        self.s.get(self.i).copied()
    }
    fn name(&mut self) -> Option<String> {
        let st = self.i;
        let c = self.peek()?;
        if !(c.is_ascii_alphabetic() || c == b'_') {
            return None;
        }
        while let Some(c) = self.peek() {
            if c.is_ascii_alphanumeric() || c == b'_' {
                self.i += 1;
            } else {
                break;
            }
        }
        Some(String::from_utf8_lossy(&self.s[st..self.i]).into_owned())
    }
    fn expect(&mut self, c: u8) -> Option<()> {
        self.ws();
        if self.peek() == Some(c) {
            self.i += 1;
            Some(())
        } else {
            None
        }
    }
    fn ty(&mut self) -> Option<T> {
        let mut alts = vec![self.alt()?];
        loop {
            self.ws();
            if self.peek() == Some(b'|') {
                self.i += 1;
                alts.push(self.alt()?);
            } else {
                break;
            }
        }
        if alts.len() == 1 {
            alts.pop()
        } else {
            Some(T::Union(alts))
        }
    }
    fn alt(&mut self) -> Option<T> {
        self.ws();
        let n = self.name()?;
        match n.as_str() {
            "text" => return Some(T::Text),
            "bytes" => return Some(T::Bytes),
            "bool" => return Some(T::Bool),
            "none" => return Some(T::None),
            "i64" => return Some(T::I64),
            "u64" => return Some(T::U64),
            "f64" => return Some(T::F64),
            "json" => return Some(T::Json),
            "tuple" | "list" | "map" | "record" => {}
            _ => return None,
        }
        if self.peek() != Some(b'[') {
            return None;
        }
        self.i += 1;
        match n.as_str() {
            "tuple" => {
                let mut items = vec![];
                loop {
                    items.push(self.ty()?);
                    self.ws();
                    match self.peek()? {
                        b',' => self.i += 1,
                        b']' => {
                            self.i += 1;
                            break;
                        }
                        _ => return None,
                    }
                }
                Some(T::Tuple(items))
            }
            "list" => {
                let t = self.ty()?;
                self.expect(b']')?;
                Some(T::List(Box::new(t)))
            }
            "map" => {
                let k = self.ty()?;
                self.expect(b',')?;
                let v = self.ty()?;
                self.expect(b']')?;
                Some(T::Map(Box::new(k), Box::new(v)))
            }
            _ => {
                let mut fields: Vec<(String, T)> = vec![];
                loop {
                    self.ws();
                    let nm = self.name()?;
                    self.expect(b':')?;
                    let t = self.ty()?;
                    if fields.iter().any(|(k, _)| *k == nm) {
                        return None;
                    }
                    fields.push((nm, t));
                    self.ws();
                    match self.peek()? {
                        b',' => self.i += 1,
                        b']' => {
                            self.i += 1;
                            break;
                        }
                        _ => return None,
                    }
                }
                Some(T::Record(fields))
            }
        }
    }
}

fn parse_type(s: &str) -> Option<T> {
    let mut p = P { s: s.as_bytes(), i: 0 };
    let t = p.ty()?;
    p.ws();
    if p.i == p.s.len() {
        Some(t)
    } else {
        None
    }
}

fn get<'a>(m: &'a [(String, V)], k: &str) -> Option<&'a V> {
    m.iter().find(|(n, _)| n == k).map(|(_, v)| v)
}

fn valid_num_literal(s: &str) -> bool {
    let b = s.as_bytes();
    let mut i = 0;
    if i < b.len() && b[i] == b'-' {
        i += 1;
    }
    if i >= b.len() {
        return false;
    }
    if b[i] == b'0' {
        i += 1;
    } else if b[i].is_ascii_digit() {
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
    } else {
        return false;
    }
    if i < b.len() && b[i] == b'.' {
        i += 1;
        let st = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == st {
            return false;
        }
    }
    if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
        i += 1;
        if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
            i += 1;
        }
        let st = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == st {
            return false;
        }
    }
    i == b.len()
}

fn valid_int_literal(s: &str) -> bool {
    let b = s.as_bytes();
    let mut i = 0;
    if i < b.len() && b[i] == b'-' {
        i += 1;
    }
    if i >= b.len() {
        return false;
    }
    if b[i] == b'0' {
        return i + 1 == b.len();
    }
    if !(b'1'..=b'9').contains(&b[i]) {
        return false;
    }
    b[i..].iter().all(|c| c.is_ascii_digit())
}

fn resolve<'a>(v: &'a V) -> R<Cow<'a, V>> {
    if let V::Map(m, false) = v {
        if let Some(V::Text(tag)) = get(m, "__t") {
            let val = get(m, "v");
            return match tag.as_str() {
                "num" => match val {
                    Some(V::Text(s)) => {
                        let x = match s.as_str() {
                            "NaN" => f64::NAN,
                            "Infinity" => f64::INFINITY,
                            "-Infinity" => f64::NEG_INFINITY,
                            "-0" => -0.0,
                            _ => {
                                if !valid_num_literal(s) {
                                    return Err(());
                                }
                                s.parse::<f64>().map_err(|_| ())?
                            }
                        };
                        Ok(Cow::Owned(V::Num(x)))
                    }
                    _ => Err(()),
                },
                "bigint" => match val {
                    Some(V::Text(s)) if valid_int_literal(s) => Ok(Cow::Owned(V::Int(s.parse::<i128>().ok()))),
                    _ => Err(()),
                },
                "undef" => Ok(Cow::Owned(V::Absent)),
                "obj" => {
                    let entries: Vec<(String, V)> = match val {
                        Some(V::Map(e, _)) => e.clone(),
                        Some(V::List(l)) => l.iter().enumerate().map(|(i, x)| (i.to_string(), x.clone())).collect(),
                        Some(V::Text(s)) => s
                            .encode_utf16()
                            .enumerate()
                            .map(|(i, u)| {
                                let x = match char::from_u32(u as u32) {
                                    Some(c) => V::Text(c.to_string()),
                                    None => V::Bad,
                                };
                                (i.to_string(), x)
                            })
                            .collect(),
                        Some(V::Num(_)) | Some(V::Bool(_)) | Some(V::Int(_)) => vec![],
                        _ => return Err(()),
                    };
                    Ok(Cow::Owned(V::Map(entries, true)))
                }
                _ => Err(()),
            };
        }
    }
    Ok(Cow::Borrowed(v))
}

fn render(x: f64) -> String {
    if x.is_nan() {
        return "NaN".into();
    }
    if x.is_infinite() {
        return if x < 0.0 { "-Infinity".into() } else { "Infinity".into() };
    }
    if x == 0.0 {
        return if x.is_sign_negative() { "-0".into() } else { "0".into() };
    }
    let ax = x.abs();
    let short = format!("{:e}", ax);
    let k = short.split('e').next().unwrap().replace('.', "").len();
    let full = format!("{:.*e}", k - 1, ax);
    let mut it = full.split('e');
    let digits: String = it.next().unwrap().replace('.', "");
    let e: i32 = it.next().unwrap().parse().unwrap();
    let k = k as i32;
    let n = e + 1;
    let mut out = String::new();
    if x < 0.0 {
        out.push('-');
    }
    if k <= n && n <= 21 {
        out.push_str(&digits);
        out.push_str(&"0".repeat((n - k) as usize));
    } else if 0 < n && n <= 21 {
        out.push_str(&digits[..n as usize]);
        out.push('.');
        out.push_str(&digits[n as usize..]);
    } else if -6 < n && n <= 0 {
        out.push_str("0.");
        out.push_str(&"0".repeat((-n) as usize));
        out.push_str(&digits);
    } else {
        out.push_str(&digits[..1]);
        if k > 1 {
            out.push('.');
            out.push_str(&digits[1..]);
        }
        out.push('e');
        out.push(if n - 1 >= 0 { '+' } else { '-' });
        out.push_str(&(n - 1).abs().to_string());
    }
    out
}

fn bits(x: f64) -> String {
    if x.is_nan() {
        "7ff8000000000000".into()
    } else {
        format!("{:016x}", x.to_bits())
    }
}

fn mk(p: Vec<(&str, Value)>) -> Value {
    let mut m = Map::new();
    for (k, v) in p {
        m.insert(k.to_string(), v);
    }
    Value::Object(m)
}

fn s(x: &str) -> Value {
    Value::String(x.to_string())
}

fn text_node(x: &str) -> Value {
    mk(vec![("t", s("text")), ("v", s(x)), ("cu", s("utf8"))])
}

fn esc(x: &str, out: &mut String) {
    out.push('"');
    for c in x.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\t' => out.push_str("\\t"),
            '\n' => out.push_str("\\n"),
            '\u{c}' => out.push_str("\\f"),
            '\r' => out.push_str("\\r"),
            c if (c as u32) < 32 => out.push_str(&format!("\\u00{:02x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

fn canon(v: &Value, out: &mut String) {
    match v {
        Value::Object(m) => {
            let t = m.get("t").and_then(|x| x.as_str()).unwrap_or("");
            let mut keys: Vec<&String> = m
                .keys()
                .filter(|k| match t {
                    "f64" => k.as_str() == "bits" || k.as_str() == "t",
                    "throw" => k.as_str() == "t",
                    _ => true,
                })
                .collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            out.push('{');
            for (i, k) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                esc(k, out);
                out.push(':');
                canon(&m[*k], out);
            }
            out.push('}');
        }
        Value::Array(a) => {
            out.push('[');
            for (i, x) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                canon(x, out);
            }
            out.push(']');
        }
        Value::String(x) => esc(x, out),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Null => out.push_str("null"),
        Value::Number(n) => out.push_str(&n.to_string()),
    }
}

fn sort_pairs(mut v: Vec<(Vec<u16>, Value, Value)>) -> Value {
    v.sort_by(|a, b| a.0.cmp(&b.0));
    mk(vec![
        ("t", s("map")),
        ("v", Value::Array(v.into_iter().map(|(_, k, x)| Value::Array(vec![k, x])).collect())),
    ])
}

fn int_node(t: &str, x: i128) -> Value {
    mk(vec![("t", s(t)), ("v", s(&x.to_string()))])
}

fn json_node(v: &V) -> R<Value> {
    let v = resolve(v)?;
    match &*v {
        V::None => Ok(mk(vec![("t", s("none"))])),
        V::Bool(b) => Ok(mk(vec![("t", s("bool")), ("v", Value::Bool(*b))])),
        V::Num(x) => Ok(mk(vec![("t", s("f64")), ("v", s(&render(*x))), ("bits", s(&bits(*x)))])),
        V::Text(x) => Ok(text_node(x)),
        V::List(l) => {
            let mut out = vec![];
            for x in l {
                out.push(json_node(x)?);
            }
            Ok(mk(vec![("t", s("list")), ("v", Value::Array(out))]))
        }
        V::Map(m, _) => {
            let mut out = vec![];
            for (k, x) in m {
                out.push((k.encode_utf16().collect::<Vec<u16>>(), text_node(k), json_node(x)?));
            }
            Ok(sort_pairs(out))
        }
        _ => Err(()),
    }
}

fn integral(v: &V, lo: i128, hi: i128, t: &str) -> R<Value> {
    match v {
        V::Num(x) => {
            let x = *x;
            if !x.is_finite() || x.trunc() != x || x.abs() >= 1e30 {
                return Err(());
            }
            let i = x as i128;
            if i < lo || i > hi {
                return Err(());
            }
            Ok(int_node(t, i))
        }
        V::Int(Some(i)) => {
            if *i < lo || *i > hi {
                Err(())
            } else {
                Ok(int_node(t, *i))
            }
        }
        _ => Err(()),
    }
}

fn encode(v: &V, t: &T) -> R<Value> {
    if let V::Map(m, false) = v {
        for key in ["__throw", "__threw"] {
            if let Some(V::Text(msg)) = get(m, key) {
                return Ok(mk(vec![("t", s("throw")), ("msg", s(msg))]));
            }
        }
    }
    let r = resolve(v)?;
    let v: &V = &r;
    match t {
        T::Union(alts) => {
            for a in alts {
                if let Ok(x) = encode(v, a) {
                    return Ok(x);
                }
            }
            Err(())
        }
        T::None => match v {
            V::None | V::Absent => Ok(mk(vec![("t", s("none"))])),
            _ => Err(()),
        },
        T::Bool => match v {
            V::Bool(b) => Ok(mk(vec![("t", s("bool")), ("v", Value::Bool(*b))])),
            _ => Err(()),
        },
        T::Text => match v {
            V::Text(x) => Ok(text_node(x)),
            _ => Err(()),
        },
        T::F64 => match v {
            V::Num(x) => Ok(mk(vec![("t", s("f64")), ("v", s(&render(*x))), ("bits", s(&bits(*x)))])),
            _ => Err(()),
        },
        T::I64 => integral(v, i64::MIN as i128, i64::MAX as i128, "i64"),
        T::U64 => integral(v, 0, u64::MAX as i128, "u64"),
        T::Bytes => Err(()),
        T::Json => json_node(v),
        T::Tuple(ts) => match v {
            V::List(l) if l.len() == ts.len() => {
                let mut out = vec![];
                for (x, ty) in l.iter().zip(ts) {
                    out.push(encode(x, ty)?);
                }
                Ok(mk(vec![("t", s("tuple")), ("v", Value::Array(out))]))
            }
            _ => Err(()),
        },
        T::List(ty) => match v {
            V::List(l) => {
                let mut out = vec![];
                for x in l {
                    out.push(encode(x, ty)?);
                }
                Ok(mk(vec![("t", s("list")), ("v", Value::Array(out))]))
            }
            _ => Err(()),
        },
        T::Map(kt, vt) => match v {
            V::Map(m, _) => {
                let mut out = vec![];
                for (k, x) in m {
                    let kn = encode(&V::Text(k.clone()), kt)?;
                    let vn = encode(x, vt)?;
                    let sk: Vec<u16> = if kn.get("t").and_then(|x| x.as_str()) == Some("text") {
                        kn.get("v").and_then(|x| x.as_str()).unwrap_or("").encode_utf16().collect()
                    } else {
                        let mut c = String::new();
                        canon(&kn, &mut c);
                        c.encode_utf16().collect()
                    };
                    out.push((sk, kn, vn));
                }
                Ok(sort_pairs(out))
            }
            _ => Err(()),
        },
        T::Record(fields) => match v {
            V::Map(m, _) => {
                let mut out = vec![];
                for (name, ty) in fields {
                    let fv = get(m, name).cloned().unwrap_or(V::Absent);
                    out.push(Value::Array(vec![s(name), encode(&fv, ty)?]));
                }
                Ok(mk(vec![("t", s("record")), ("v", Value::Array(out))]))
            }
            _ => Err(()),
        },
    }
}

pub fn encode_value(value: &Value, ty: &str) -> Value {
    let t = match parse_type(ty) {
        Some(t) => t,
        None => panic!("bad type"),
    };
    match encode(&from_json(value), &t) {
        Ok(v) => v,
        Err(()) => panic!("encode failure"),
    }
}
