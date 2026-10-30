use serde_json::{json, Map, Value};
use std::borrow::Cow;

#[derive(Clone)]
enum V {
    Absent,
    Null,
    Bool(bool),
    Num(f64),
    Int(Option<i128>),
    Str(String),
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
        Value::Null => V::Null,
        Value::Bool(b) => V::Bool(*b),
        Value::Number(n) => V::Num(n.as_f64().unwrap_or(f64::NAN)),
        Value::String(s) => V::Str(s.clone()),
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
    fn name(&mut self) -> R<String> {
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
    fn expect(&mut self, c: u8) -> R<()> {
        if self.peek() == Some(c) {
            self.i += 1;
            Ok(())
        } else {
            Err(())
        }
    }
    fn ty(&mut self) -> R<T> {
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
            Ok(T::Union(alts))
        }
    }
    fn alt(&mut self) -> R<T> {
        self.ws();
        let n = self.name()?;
        match n.as_str() {
            "text" => Ok(T::Text),
            "bytes" => Ok(T::Bytes),
            "bool" => Ok(T::Bool),
            "none" => Ok(T::None),
            "i64" => Ok(T::I64),
            "u64" => Ok(T::U64),
            "f64" => Ok(T::F64),
            "json" => Ok(T::Json),
            "tuple" => {
                self.expect(b'[')?;
                let mut items = vec![self.ty()?];
                loop {
                    self.ws();
                    if self.peek() == Some(b',') {
                        self.i += 1;
                        items.push(self.ty()?);
                    } else {
                        break;
                    }
                }
                self.ws();
                self.expect(b']')?;
                Ok(T::Tuple(items))
            }
            "list" => {
                self.expect(b'[')?;
                let t = self.ty()?;
                self.ws();
                self.expect(b']')?;
                Ok(T::List(Box::new(t)))
            }
            "map" => {
                self.expect(b'[')?;
                let k = self.ty()?;
                self.ws();
                self.expect(b',')?;
                let v = self.ty()?;
                self.ws();
                self.expect(b']')?;
                Ok(T::Map(Box::new(k), Box::new(v)))
            }
            "record" => {
                self.expect(b'[')?;
                let mut fs: Vec<(String, T)> = Vec::new();
                loop {
                    self.ws();
                    let f = self.name()?;
                    if fs.iter().any(|(n, _)| *n == f) {
                        return Err(());
                    }
                    self.ws();
                    self.expect(b':')?;
                    let t = self.ty()?;
                    fs.push((f, t));
                    self.ws();
                    if self.peek() == Some(b',') {
                        self.i += 1;
                    } else {
                        break;
                    }
                }
                self.expect(b']')?;
                Ok(T::Record(fs))
            }
            _ => Err(()),
        }
    }
}

fn parse_type(s: &str) -> R<T> {
    let mut p = P { b: s.as_bytes(), i: 0 };
    let t = p.ty()?;
    p.ws();
    if p.i != p.b.len() {
        return Err(());
    }
    Ok(t)
}

fn is_dec(s: &str) -> bool {
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

fn is_numlit(s: &str) -> bool {
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
    } else if (b'1'..=b'9').contains(&b[i]) {
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

fn resolve(v: &V) -> R<Cow<'_, V>> {
    if let V::Map(es, false) = v {
        let tag = match es.iter().find(|(k, _)| k == "__t") {
            Some((_, V::Str(t))) => t.as_str(),
            _ => return Ok(Cow::Borrowed(v)),
        };
        let member = es.iter().find(|(k, _)| k == "v").map(|(_, x)| x);
        return match tag {
            "num" => match member {
                Some(V::Str(s)) => {
                    let x = match s.as_str() {
                        "NaN" => f64::NAN,
                        "Infinity" => f64::INFINITY,
                        "-Infinity" => f64::NEG_INFINITY,
                        "-0" => -0.0,
                        _ => {
                            if !is_numlit(s) {
                                return Err(());
                            }
                            s.parse::<f64>().map_err(|_| ())?
                        }
                    };
                    Ok(Cow::Owned(V::Num(x)))
                }
                _ => Err(()),
            },
            "bigint" => match member {
                Some(V::Str(s)) if is_dec(s) => Ok(Cow::Owned(V::Int(s.parse::<i128>().ok()))),
                _ => Err(()),
            },
            "undef" => Ok(Cow::Owned(V::Absent)),
            "obj" => match member {
                Some(V::Map(e, _)) => Ok(Cow::Owned(V::Map(e.clone(), true))),
                Some(V::List(l)) => Ok(Cow::Owned(V::Map(
                    l.iter().enumerate().map(|(i, x)| (i.to_string(), x.clone())).collect(),
                    true,
                ))),
                Some(V::Str(s)) => Ok(Cow::Owned(V::Map(
                    s.encode_utf16()
                        .enumerate()
                        .map(|(i, u)| {
                            (
                                i.to_string(),
                                V::Str(char::from_u32(u as u32).unwrap_or('\u{FFFD}').to_string()),
                            )
                        })
                        .collect(),
                    true,
                ))),
                Some(V::Num(_)) | Some(V::Bool(_)) => Ok(Cow::Owned(V::Map(Vec::new(), true))),
                _ => Err(()),
            },
            _ => Err(()),
        };
    }
    Ok(Cow::Borrowed(v))
}

fn render(x: f64) -> String {
    if x.is_nan() {
        return "NaN".into();
    }
    if x.is_infinite() {
        return if x > 0.0 { "Infinity".into() } else { "-Infinity".into() };
    }
    if x == 0.0 {
        return if x.is_sign_negative() { "-0".into() } else { "0".into() };
    }
    let ax = x.abs();
    let s = format!("{:e}", ax);
    let k = s.split('e').next().unwrap().chars().filter(|c| c.is_ascii_digit()).count();
    let s2 = format!("{:.*e}", k - 1, ax);
    let mut it = s2.split('e');
    let digits: String = it.next().unwrap().chars().filter(|c| c.is_ascii_digit()).collect();
    let e: i32 = it.next().unwrap().parse().unwrap();
    let n = e + 1;
    let k = k as i32;
    let body = if k <= n && n <= 21 {
        format!("{}{}", digits, "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &digits[..n as usize], &digits[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{}", "0".repeat((-n) as usize), digits)
    } else {
        let mut r = digits[..1].to_string();
        if k > 1 {
            r.push('.');
            r.push_str(&digits[1..]);
        }
        r.push('e');
        r.push(if n - 1 < 0 { '-' } else { '+' });
        r.push_str(&(n - 1).abs().to_string());
        r
    };
    if x < 0.0 {
        format!("-{}", body)
    } else {
        body
    }
}

fn f64_node(x: f64) -> Value {
    let bits = if x.is_nan() { "7ff8000000000000".to_string() } else { format!("{:016x}", x.to_bits()) };
    json!({"t": "f64", "v": render(x), "bits": bits})
}

fn text_node(s: &str) -> Value {
    json!({"t": "text", "v": s, "cu": "utf8"})
}

fn sort_pairs(p: &mut Vec<(String, Value)>) {
    p.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
}

fn enc_json(v: &V) -> R<Value> {
    match v {
        V::Null => Ok(json!({"t": "none"})),
        V::Bool(b) => Ok(json!({"t": "bool", "v": b})),
        V::Num(x) => Ok(f64_node(*x)),
        V::Str(s) => Ok(text_node(s)),
        V::List(items) => {
            let mut out = Vec::new();
            for it in items {
                let r = resolve(it)?;
                out.push(enc_json(&r)?);
            }
            Ok(json!({"t": "list", "v": out}))
        }
        V::Map(es, _) => {
            let mut ps: Vec<(String, Value)> = Vec::new();
            for (k, x) in es {
                let r = resolve(x)?;
                ps.push((k.clone(), enc_json(&r)?));
            }
            sort_pairs(&mut ps);
            let out: Vec<Value> = ps.into_iter().map(|(k, x)| Value::Array(vec![text_node(&k), x])).collect();
            Ok(json!({"t": "map", "v": out}))
        }
        V::Absent | V::Int(_) => Err(()),
    }
}

fn int_node(t: &str, s: String) -> Value {
    json!({"t": t, "v": s})
}

fn enc(v: &V, t: &T) -> R<Value> {
    if let V::Map(es, false) = v {
        for key in ["__throw", "__threw"] {
            if let Some((_, V::Str(m))) = es.iter().find(|(k, _)| k == key) {
                return Ok(json!({"t": "throw", "msg": m}));
            }
        }
    }
    let r = resolve(v)?;
    enc_ty(&r, t)
}

fn enc_ty(v: &V, t: &T) -> R<Value> {
    match t {
        T::Union(alts) => {
            for a in alts {
                if let Ok(x) = enc_ty(v, a) {
                    return Ok(x);
                }
            }
            Err(())
        }
        T::None => match v {
            V::Null | V::Absent => Ok(json!({"t": "none"})),
            _ => Err(()),
        },
        T::Bool => match v {
            V::Bool(b) => Ok(json!({"t": "bool", "v": b})),
            _ => Err(()),
        },
        T::Text => match v {
            V::Str(s) => Ok(text_node(s)),
            _ => Err(()),
        },
        T::Bytes => Err(()),
        T::F64 => match v {
            V::Num(x) => Ok(f64_node(*x)),
            _ => Err(()),
        },
        T::I64 => match v {
            V::Num(x) => {
                let x = *x;
                if x.is_finite() && x.trunc() == x && x >= -9.223372036854775808e18 && x < 9.223372036854775808e18 {
                    Ok(int_node("i64", (x as i128).to_string()))
                } else {
                    Err(())
                }
            }
            V::Int(Some(i)) if *i >= i64::MIN as i128 && *i <= i64::MAX as i128 => Ok(int_node("i64", i.to_string())),
            _ => Err(()),
        },
        T::U64 => match v {
            V::Num(x) => {
                let x = *x;
                if x.is_finite() && x.trunc() == x && x >= 0.0 && x < 1.8446744073709552e19 {
                    Ok(int_node("u64", (x as i128).to_string()))
                } else {
                    Err(())
                }
            }
            V::Int(Some(i)) if *i >= 0 && *i <= u64::MAX as i128 => Ok(int_node("u64", i.to_string())),
            _ => Err(()),
        },
        T::Json => enc_json(v),
        T::Tuple(ts) => match v {
            V::List(items) if items.len() == ts.len() => {
                let mut out = Vec::new();
                for (it, ty) in items.iter().zip(ts) {
                    out.push(enc(it, ty)?);
                }
                Ok(json!({"t": "tuple", "v": out}))
            }
            _ => Err(()),
        },
        T::List(ty) => match v {
            V::List(items) => {
                let mut out = Vec::new();
                for it in items {
                    out.push(enc(it, ty)?);
                }
                Ok(json!({"t": "list", "v": out}))
            }
            _ => Err(()),
        },
        T::Map(kt, vt) => match v {
            V::Map(es, _) => {
                let mut ps: Vec<(String, Value)> = Vec::new();
                for (k, x) in es {
                    let kn = enc(&V::Str(k.clone()), kt)?;
                    let vn = enc(x, vt)?;
                    ps.push((k.clone(), Value::Array(vec![kn, vn])));
                }
                sort_pairs(&mut ps);
                let out: Vec<Value> = ps.into_iter().map(|(_, p)| p).collect();
                Ok(json!({"t": "map", "v": out}))
            }
            _ => Err(()),
        },
        T::Record(fs) => match v {
            V::Map(es, _) => {
                let mut out = Vec::new();
                for (name, ty) in fs {
                    let fv = es.iter().find(|(k, _)| k == name).map(|(_, x)| x).unwrap_or(&V::Absent);
                    out.push(Value::Array(vec![Value::String(name.clone()), enc(fv, ty)?]));
                }
                Ok(json!({"t": "record", "v": out}))
            }
            _ => Err(()),
        },
    }
}

pub fn encode_value(value: &serde_json::Value, ty: &str) -> serde_json::Value {
    let t = match parse_type(ty) {
        Ok(t) => t,
        Err(_) => panic!("bad type"),
    };
    let v = from_json(value);
    match enc(&v, &t) {
        Ok(x) => x,
        Err(_) => panic!("throw"),
    }
}

#[allow(dead_code)]
fn _unused(_: Map<String, Value>) {}
