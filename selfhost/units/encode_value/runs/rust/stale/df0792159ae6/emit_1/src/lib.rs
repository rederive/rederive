use serde_json::{json, Map, Value};

#[derive(Clone)]
enum V {
    Null,
    Bool(bool),
    Num(f64),
    Int(Option<i128>),
    Text(String),
    List(Vec<V>),
    Map(Vec<(String, V)>, bool),
    Absent,
}

enum Ty {
    Scalar(&'static str),
    Tuple(Vec<Ty>),
    List(Box<Ty>),
    Map(Box<Ty>, Box<Ty>),
    Record(Vec<(String, Ty)>),
    Union(Vec<Ty>),
}

type R = Result<Value, ()>;

fn from_json(v: &Value) -> V {
    match v {
        Value::Null => V::Null,
        Value::Bool(b) => V::Bool(*b),
        Value::Number(n) => V::Num(n.as_f64().unwrap_or(f64::NAN)),
        Value::String(s) => V::Text(s.clone()),
        Value::Array(a) => V::List(a.iter().map(from_json).collect()),
        Value::Object(o) => V::Map(o.iter().map(|(k, x)| (k.clone(), from_json(x))).collect(), false),
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
    fn peek(&self) -> Option<u8> {
        self.b.get(self.i).copied()
    }
    fn eat(&mut self, c: u8) -> Result<(), ()> {
        if self.peek() == Some(c) {
            self.i += 1;
            Ok(())
        } else {
            Err(())
        }
    }
    fn name(&mut self) -> Result<String, ()> {
        let s = self.i;
        match self.peek() {
            Some(c) if c.is_ascii_alphabetic() || c == b'_' => self.i += 1,
            _ => return Err(()),
        }
        while let Some(c) = self.peek() {
            if c.is_ascii_alphanumeric() || c == b'_' {
                self.i += 1;
            } else {
                break;
            }
        }
        Ok(String::from_utf8_lossy(&self.b[s..self.i]).into_owned())
    }
    fn ty(&mut self) -> Result<Ty, ()> {
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
            Ok(alts.pop().unwrap())
        } else {
            Ok(Ty::Union(alts))
        }
    }
    fn alt(&mut self) -> Result<Ty, ()> {
        self.ws();
        let n = self.name()?;
        match n.as_str() {
            "text" => Ok(Ty::Scalar("text")),
            "bytes" => Ok(Ty::Scalar("bytes")),
            "bool" => Ok(Ty::Scalar("bool")),
            "none" => Ok(Ty::Scalar("none")),
            "i64" => Ok(Ty::Scalar("i64")),
            "u64" => Ok(Ty::Scalar("u64")),
            "f64" => Ok(Ty::Scalar("f64")),
            "json" => Ok(Ty::Scalar("json")),
            "tuple" => {
                self.eat(b'[')?;
                let mut items = Vec::new();
                loop {
                    self.ws();
                    items.push(self.ty()?);
                    self.ws();
                    match self.peek() {
                        Some(b',') => self.i += 1,
                        Some(b']') => {
                            self.i += 1;
                            break;
                        }
                        _ => return Err(()),
                    }
                }
                Ok(Ty::Tuple(items))
            }
            "list" => {
                self.eat(b'[')?;
                self.ws();
                let t = self.ty()?;
                self.ws();
                self.eat(b']')?;
                Ok(Ty::List(Box::new(t)))
            }
            "map" => {
                self.eat(b'[')?;
                self.ws();
                let k = self.ty()?;
                self.ws();
                self.eat(b',')?;
                self.ws();
                let v = self.ty()?;
                self.ws();
                self.eat(b']')?;
                Ok(Ty::Map(Box::new(k), Box::new(v)))
            }
            "record" => {
                self.eat(b'[')?;
                let mut fields: Vec<(String, Ty)> = Vec::new();
                loop {
                    self.ws();
                    let f = self.name()?;
                    if fields.iter().any(|(n, _)| *n == f) {
                        return Err(());
                    }
                    self.ws();
                    self.eat(b':')?;
                    self.ws();
                    let t = self.ty()?;
                    fields.push((f, t));
                    self.ws();
                    match self.peek() {
                        Some(b',') => self.i += 1,
                        Some(b']') => {
                            self.i += 1;
                            break;
                        }
                        _ => return Err(()),
                    }
                }
                Ok(Ty::Record(fields))
            }
            _ => Err(()),
        }
    }
}

fn parse_type(s: &str) -> Result<Ty, ()> {
    let mut p = P { b: s.as_bytes(), i: 0 };
    p.ws();
    let t = p.ty()?;
    p.ws();
    if p.i != p.b.len() {
        return Err(());
    }
    Ok(t)
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
    let a = x.abs();
    let short = format!("{:e}", a);
    let mant = short.split('e').next().unwrap();
    let k = mant.chars().filter(|c| c.is_ascii_digit()).count();
    let full = format!("{:.*e}", k - 1, a);
    let mut parts = full.split('e');
    let d: String = parts.next().unwrap().chars().filter(|c| c.is_ascii_digit()).collect();
    let e: i32 = parts.next().unwrap().parse().unwrap();
    let n = e + 1;
    let k = k as i32;
    let body = if k <= n && n <= 21 {
        format!("{}{}", d, "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &d[..n as usize], &d[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{}", "0".repeat((-n) as usize), d)
    } else {
        let mut s = d[..1].to_string();
        if k > 1 {
            s.push('.');
            s.push_str(&d[1..]);
        }
        s.push('e');
        s.push(if n - 1 < 0 { '-' } else { '+' });
        s.push_str(&(n - 1).abs().to_string());
        s
    };
    if x < 0.0 {
        format!("-{}", body)
    } else {
        body
    }
}

fn bits(x: f64) -> String {
    if x.is_nan() {
        "7ff8000000000000".into()
    } else {
        format!("{:016x}", x.to_bits())
    }
}

fn esc(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\t' => out.push_str("\\t"),
            '\n' => out.push_str("\\n"),
            '\u{c}' => out.push_str("\\f"),
            '\r' => out.push_str("\\r"),
            c if (c as u32) < 32 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

fn canon_into(v: &Value, out: &mut String) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&n.to_string()),
        Value::String(s) => esc(s, out),
        Value::Array(a) => {
            out.push('[');
            for (i, x) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                canon_into(x, out);
            }
            out.push(']');
        }
        Value::Object(o) => {
            let t = o.get("t").and_then(|x| x.as_str()).unwrap_or("");
            let mut ms: Vec<(&String, &Value)> = o
                .iter()
                .filter(|(k, _)| match t {
                    "f64" => k.as_str() == "bits" || k.as_str() == "t",
                    "throw" => k.as_str() == "t",
                    _ => true,
                })
                .collect();
            ms.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
            out.push('{');
            for (i, (k, x)) in ms.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                esc(k, out);
                out.push(':');
                canon_into(x, out);
            }
            out.push('}');
        }
    }
}

fn canon(v: &Value) -> String {
    let mut s = String::new();
    canon_into(v, &mut s);
    s
}

fn get<'a>(m: &'a [(String, V)], k: &str) -> Option<&'a V> {
    m.iter().find(|(n, _)| n == k).map(|(_, v)| v)
}

fn num_literal(s: &str) -> bool {
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
        let s0 = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == s0 {
            return false;
        }
    }
    if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
        i += 1;
        if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
            i += 1;
        }
        let s0 = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == s0 {
            return false;
        }
    }
    i == b.len()
}

fn int_literal(s: &str) -> bool {
    let b = s.strip_prefix('-').unwrap_or(s).as_bytes();
    if b.is_empty() || !b.iter().all(|c| c.is_ascii_digit()) {
        return false;
    }
    b[0] != b'0' || b.len() == 1
}

fn resolve(m: &[(String, V)]) -> Result<V, ()> {
    let tag = match get(m, "__t") {
        Some(V::Text(t)) => t.clone(),
        _ => return Err(()),
    };
    let v = get(m, "v");
    match tag.as_str() {
        "num" => match v {
            Some(V::Text(s)) => match s.as_str() {
                "NaN" => Ok(V::Num(f64::NAN)),
                "Infinity" => Ok(V::Num(f64::INFINITY)),
                "-Infinity" => Ok(V::Num(f64::NEG_INFINITY)),
                "-0" => Ok(V::Num(-0.0)),
                _ => {
                    if !num_literal(s) {
                        return Err(());
                    }
                    s.parse::<f64>().map(V::Num).map_err(|_| ())
                }
            },
            _ => Err(()),
        },
        "bigint" => match v {
            Some(V::Text(s)) if int_literal(s) => Ok(V::Int(s.parse::<i128>().ok())),
            _ => Err(()),
        },
        "undef" => Ok(V::Absent),
        "obj" => {
            let entries: Vec<(String, V)> = match v {
                Some(V::Map(e, _)) => e.clone(),
                Some(V::List(l)) => l.iter().enumerate().map(|(i, x)| (i.to_string(), x.clone())).collect(),
                Some(V::Text(s)) => s
                    .encode_utf16()
                    .enumerate()
                    .map(|(i, u)| {
                        let c = char::from_u32(u as u32).unwrap_or('\u{fffd}');
                        (i.to_string(), V::Text(c.to_string()))
                    })
                    .collect(),
                Some(V::Num(_)) | Some(V::Bool(_)) | Some(V::Int(_)) => Vec::new(),
                _ => return Err(()),
            };
            Ok(V::Map(entries, true))
        }
        _ => Err(()),
    }
}

fn is_tagged(m: &[(String, V)]) -> bool {
    matches!(get(m, "__t"), Some(V::Text(_)))
}

fn sort_pairs(mut ps: Vec<(String, Value)>) -> Vec<Value> {
    ps.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
    ps.into_iter().map(|(_, p)| p).collect()
}

fn text_node(s: &str) -> Value {
    json!({"t": "text", "v": s, "cu": "utf8"})
}

fn f64_node(x: f64) -> Value {
    json!({"t": "f64", "v": render(x), "bits": bits(x)})
}

fn jenc(v: &V) -> R {
    let owned;
    let mut cur = v;
    if let V::Map(m, false) = v {
        if is_tagged(m) {
            owned = resolve(m)?;
            cur = &owned;
        }
    }
    match cur {
        V::Null => Ok(json!({"t": "none"})),
        V::Bool(b) => Ok(json!({"t": "bool", "v": b})),
        V::Num(x) => Ok(f64_node(*x)),
        V::Text(s) => Ok(text_node(s)),
        V::List(l) => {
            let mut out = Vec::new();
            for x in l {
                out.push(jenc(x)?);
            }
            Ok(json!({"t": "list", "v": out}))
        }
        V::Map(m, _) => {
            let mut ps = Vec::new();
            for (k, x) in m {
                let vn = jenc(x)?;
                ps.push((k.clone(), Value::Array(vec![text_node(k), vn])));
            }
            Ok(json!({"t": "map", "v": sort_pairs(ps)}))
        }
        V::Int(_) | V::Absent => Err(()),
    }
}

fn int_of(v: &V, lo: i128, hi: i128) -> Result<String, ()> {
    let i = match v {
        V::Num(x) => {
            if !x.is_finite() || x.trunc() != *x {
                return Err(());
            }
            *x as i128
        }
        V::Int(Some(i)) => *i,
        _ => return Err(()),
    };
    if i < lo || i > hi {
        return Err(());
    }
    Ok(i.to_string())
}

fn enc(v: &V, ty: &Ty) -> R {
    let owned;
    let mut cur = v;
    if let V::Map(m, false) = v {
        if let Some(V::Text(s)) = get(m, "__throw") {
            return Ok(json!({"t": "throw", "msg": s}));
        }
        if let Some(V::Text(s)) = get(m, "__threw") {
            return Ok(json!({"t": "throw", "msg": s}));
        }
        if is_tagged(m) {
            owned = resolve(m)?;
            cur = &owned;
        }
    }
    match ty {
        Ty::Scalar(n) => match *n {
            "none" => match cur {
                V::Null | V::Absent => Ok(json!({"t": "none"})),
                _ => Err(()),
            },
            "bool" => match cur {
                V::Bool(b) => Ok(json!({"t": "bool", "v": b})),
                _ => Err(()),
            },
            "text" => match cur {
                V::Text(s) => Ok(text_node(s)),
                _ => Err(()),
            },
            "f64" => match cur {
                V::Num(x) => Ok(f64_node(*x)),
                _ => Err(()),
            },
            "i64" => {
                let s = int_of(cur, -(1i128 << 63), (1i128 << 63) - 1)?;
                Ok(json!({"t": "i64", "v": s}))
            }
            "u64" => {
                let s = int_of(cur, 0, (1i128 << 64) - 1)?;
                Ok(json!({"t": "u64", "v": s}))
            }
            "json" => jenc(cur),
            _ => Err(()),
        },
        Ty::Tuple(ts) => match cur {
            V::List(l) if l.len() == ts.len() => {
                let mut out = Vec::new();
                for (x, t) in l.iter().zip(ts) {
                    out.push(enc(x, t)?);
                }
                Ok(json!({"t": "tuple", "v": out}))
            }
            _ => Err(()),
        },
        Ty::List(t) => match cur {
            V::List(l) => {
                let mut out = Vec::new();
                for x in l {
                    out.push(enc(x, t)?);
                }
                Ok(json!({"t": "list", "v": out}))
            }
            _ => Err(()),
        },
        Ty::Map(kt, vt) => match cur {
            V::Map(m, _) => {
                let mut ps = Vec::new();
                for (k, x) in m {
                    let kn = enc(&V::Text(k.clone()), kt)?;
                    let vn = enc(x, vt)?;
                    let sk = if kn["t"] == "text" {
                        kn["v"].as_str().unwrap_or("").to_string()
                    } else {
                        canon(&kn)
                    };
                    ps.push((sk, Value::Array(vec![kn, vn])));
                }
                Ok(json!({"t": "map", "v": sort_pairs(ps)}))
            }
            _ => Err(()),
        },
        Ty::Record(fs) => match cur {
            V::Map(m, _) => {
                let mut out = Vec::new();
                for (name, t) in fs {
                    let absent = V::Absent;
                    let fv = get(m, name).unwrap_or(&absent);
                    let n = enc(fv, t)?;
                    out.push(Value::Array(vec![Value::String(name.clone()), n]));
                }
                Ok(json!({"t": "record", "v": out}))
            }
            _ => Err(()),
        },
        Ty::Union(alts) => {
            for a in alts {
                if let Ok(n) = enc(cur, a) {
                    return Ok(n);
                }
            }
            Err(())
        }
    }
}

pub fn encode_value(value: &serde_json::Value, ty: &str) -> serde_json::Value {
    let t = match parse_type(ty) {
        Ok(t) => t,
        Err(_) => panic!("bad type"),
    };
    let v = from_json(value);
    match enc(&v, &t) {
        Ok(n) => n,
        Err(_) => panic!("encode throw"),
    }
}

#[allow(dead_code)]
fn _unused(_: Map<String, Value>) {}
