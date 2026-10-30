use serde_json::{json, Map, Value};
use std::borrow::Cow;

const MAX_VALUE_DEPTH: usize = 100;
const MAX_DEPTH: usize = 16;

type R<T> = Result<T, ()>;

#[derive(Clone)]
enum V {
    None,
    Absent,
    Bool(bool),
    Num(f64),
    Int(Option<i128>),
    Str(String),
    List(Vec<V>),
    Map(Vec<(String, V)>, bool),
}

enum Ty {
    Text,
    Bytes,
    Bool,
    NoneT,
    I64,
    U64,
    F64,
    Json,
    Tuple(Vec<Ty>),
    List(Box<Ty>),
    Map(Box<Ty>, Box<Ty>),
    Record(Vec<(String, Ty)>),
    Union(Vec<Ty>),
}

fn from_json(v: &Value) -> V {
    match v {
        Value::Null => V::None,
        Value::Bool(b) => V::Bool(*b),
        Value::Number(n) => V::Num(n.as_f64().unwrap_or(f64::NAN)),
        Value::String(s) => V::Str(s.clone()),
        Value::Array(a) => V::List(a.iter().map(from_json).collect()),
        Value::Object(o) => V::Map(o.iter().map(|(k, x)| (k.clone(), from_json(x))).collect(), false),
    }
}

struct P {
    c: Vec<char>,
    i: usize,
}

impl P {
    fn ws(&mut self) {
        while self.i < self.c.len() && matches!(self.c[self.i], ' ' | '\t' | '\r' | '\n') {
            self.i += 1;
        }
    }
    fn peek(&mut self) -> Option<char> {
        self.ws();
        self.c.get(self.i).copied()
    }
    fn expect(&mut self, ch: char) -> R<()> {
        if self.peek() == Some(ch) {
            self.i += 1;
            Ok(())
        } else {
            Err(())
        }
    }
    fn name(&mut self) -> R<String> {
        self.ws();
        let mut s = String::new();
        match self.c.get(self.i) {
            Some(&ch) if ch.is_ascii_alphabetic() || ch == '_' => {}
            _ => return Err(()),
        }
        while let Some(&ch) = self.c.get(self.i) {
            if ch.is_ascii_alphanumeric() || ch == '_' {
                s.push(ch);
                self.i += 1;
            } else {
                break;
            }
        }
        Ok(s)
    }
    fn ty(&mut self, around: usize) -> R<Ty> {
        let mut alts = vec![self.alt(around)?];
        while self.peek() == Some('|') {
            self.i += 1;
            alts.push(self.alt(around)?);
        }
        if alts.len() == 1 {
            return Ok(alts.pop().unwrap());
        }
        for j in 1..alts.len() {
            for i in 0..j {
                if covers(&alts[i], &alts[j]) {
                    return Err(());
                }
            }
        }
        Ok(Ty::Union(alts))
    }
    fn alt(&mut self, around: usize) -> R<Ty> {
        let n = self.name()?;
        match n.as_str() {
            "text" => Ok(Ty::Text),
            "bytes" => Ok(Ty::Bytes),
            "bool" => Ok(Ty::Bool),
            "none" => Ok(Ty::NoneT),
            "i64" => Ok(Ty::I64),
            "u64" => Ok(Ty::U64),
            "f64" => Ok(Ty::F64),
            "json" => Ok(Ty::Json),
            "tuple" | "list" | "map" | "record" => {
                if around >= MAX_DEPTH {
                    return Err(());
                }
                self.expect('[')?;
                match n.as_str() {
                    "tuple" => {
                        let mut items = Vec::new();
                        loop {
                            items.push(self.ty(around + 1)?);
                            match self.peek() {
                                Some(',') => self.i += 1,
                                Some(']') => {
                                    self.i += 1;
                                    break;
                                }
                                _ => return Err(()),
                            }
                        }
                        Ok(Ty::Tuple(items))
                    }
                    "list" => {
                        let t = self.ty(around + 1)?;
                        self.expect(']')?;
                        Ok(Ty::List(Box::new(t)))
                    }
                    "map" => {
                        let k = self.ty(around + 1)?;
                        self.expect(',')?;
                        let v = self.ty(around + 1)?;
                        self.expect(']')?;
                        Ok(Ty::Map(Box::new(k), Box::new(v)))
                    }
                    _ => {
                        let mut fields: Vec<(String, Ty)> = Vec::new();
                        loop {
                            let nm = self.name()?;
                            self.expect(':')?;
                            let t = self.ty(around + 1)?;
                            if fields.iter().any(|(k, _)| *k == nm) {
                                return Err(());
                            }
                            fields.push((nm, t));
                            match self.peek() {
                                Some(',') => self.i += 1,
                                Some(']') => {
                                    self.i += 1;
                                    break;
                                }
                                _ => return Err(()),
                            }
                        }
                        Ok(Ty::Record(fields))
                    }
                }
            }
            _ => Err(()),
        }
    }
}

fn key(t: &Ty) -> String {
    match t {
        Ty::Text => "text".into(),
        Ty::Bytes => "bytes".into(),
        Ty::Bool => "bool".into(),
        Ty::NoneT => "none".into(),
        Ty::I64 => "i64".into(),
        Ty::U64 => "u64".into(),
        Ty::F64 => "f64".into(),
        Ty::Json => "json".into(),
        Ty::Tuple(v) => format!("tuple[{}]", v.iter().map(key).collect::<Vec<_>>().join(",")),
        Ty::List(i) => format!("list[{}]", key(i)),
        Ty::Map(k, v) => format!("map[{},{}]", key(k), key(v)),
        Ty::Record(f) => {
            let mut v: Vec<String> = f.iter().map(|(n, t)| format!("{}:{}", n, key(t))).collect();
            v.sort();
            format!("record[{}]", v.join(","))
        }
        Ty::Union(a) => {
            let mut v: Vec<String> = a.iter().map(key).collect();
            v.sort();
            v.dedup();
            format!("union[{}]", v.join("|"))
        }
    }
}

fn jr(t: &Ty) -> bool {
    match t {
        Ty::NoneT | Ty::Bool | Ty::F64 | Ty::Text | Ty::Json => true,
        Ty::List(i) => jr(i),
        Ty::Tuple(v) => v.iter().all(jr),
        Ty::Map(k, v) => matches!(**k, Ty::Text) && jr(v),
        Ty::Record(f) => f.iter().all(|(_, t)| jr(t)),
        Ty::Union(a) => a.iter().all(jr),
        _ => false,
    }
}

fn covers(a: &Ty, b: &Ty) -> bool {
    if key(a) == key(b) {
        return true;
    }
    if matches!(a, Ty::Json) && jr(b) {
        return true;
    }
    let structural = match (a, b) {
        (Ty::List(x), Ty::List(y)) => covers(x, y),
        (Ty::Tuple(x), Ty::Tuple(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| covers(p, q)),
        (Ty::Map(k1, v1), Ty::Map(k2, v2)) => covers(k1, k2) && covers(v1, v2),
        (Ty::Record(x), Ty::Record(y)) => x
            .iter()
            .all(|(n, t)| y.iter().any(|(m, u)| m == n && covers(t, u))),
        _ => false,
    };
    if structural {
        return true;
    }
    if let Ty::Union(bs) = b {
        if bs.iter().all(|x| covers(a, x)) {
            return true;
        }
    }
    if let Ty::Union(as_) = a {
        if as_.iter().any(|x| covers(x, b)) {
            return true;
        }
    }
    false
}

fn parse_num(s: &str) -> R<f64> {
    match s {
        "NaN" => return Ok(f64::NAN),
        "Infinity" => return Ok(f64::INFINITY),
        "-Infinity" => return Ok(f64::NEG_INFINITY),
        "-0" => return Ok(-0.0),
        _ => {}
    }
    let b = s.as_bytes();
    let mut i = 0;
    if i < b.len() && b[i] == b'-' {
        i += 1;
    }
    if i >= b.len() {
        return Err(());
    }
    if b[i] == b'0' {
        i += 1;
    } else if (b'1'..=b'9').contains(&b[i]) {
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
    } else {
        return Err(());
    }
    if i < b.len() && b[i] == b'.' {
        i += 1;
        let st = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == st {
            return Err(());
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
            return Err(());
        }
    }
    if i != b.len() {
        return Err(());
    }
    let x: f64 = s.parse().map_err(|_| ())?;
    if x.is_infinite() {
        return Err(());
    }
    if x == 0.0 {
        let mant = s.split(|c| c == 'e' || c == 'E').next().unwrap_or("");
        if mant.bytes().any(|c| (b'1'..=b'9').contains(&c)) {
            return Err(());
        }
        if x.is_sign_negative() {
            return Err(());
        }
    }
    Ok(x)
}

fn parse_big(s: &str) -> R<V> {
    let b = s.as_bytes();
    let d = if !b.is_empty() && b[0] == b'-' { &b[1..] } else { b };
    let ok = if d == b"0" && b.len() == 1 {
        true
    } else {
        !d.is_empty() && (b'1'..=b'9').contains(&d[0]) && d.iter().all(|c| c.is_ascii_digit())
    };
    if !ok {
        return Err(());
    }
    Ok(V::Int(s.parse::<i128>().ok()))
}

fn resolve(v: &V) -> R<Cow<'_, V>> {
    if let V::Map(es, false) = v {
        let get = |n: &str| es.iter().find(|(k, _)| k.as_str() == n).map(|(_, x)| x);
        if let Some(V::Str(tag)) = get("__t") {
            return match tag.as_str() {
                "num" => match get("v") {
                    Some(V::Str(s)) => Ok(Cow::Owned(V::Num(parse_num(s)?))),
                    _ => Err(()),
                },
                "bigint" => match get("v") {
                    Some(V::Str(s)) => Ok(Cow::Owned(parse_big(s)?)),
                    _ => Err(()),
                },
                "undef" => Ok(Cow::Owned(V::Absent)),
                "obj" => match get("v") {
                    Some(V::Map(e, _)) => Ok(Cow::Owned(V::Map(e.clone(), true))),
                    _ => Err(()),
                },
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
        return if x > 0.0 { "Infinity".into() } else { "-Infinity".into() };
    }
    if x == 0.0 {
        return if x.is_sign_negative() { "-0".into() } else { "0".into() };
    }
    let a = x.abs();
    let s = format!("{:e}", a);
    let k = s.split('e').next().unwrap().chars().filter(|c| c.is_ascii_digit()).count();
    let t = format!("{:.*e}", k - 1, a);
    let (m, e) = t.split_once('e').unwrap();
    let digits: String = m.chars().filter(|c| c.is_ascii_digit()).collect();
    let e: i32 = e.parse().unwrap();
    let n = e + 1;
    let k = digits.len() as i32;
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
        out.push(if n - 1 < 0 { '-' } else { '+' });
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

fn text_node(s: &str) -> Value {
    json!({"t": "text", "v": s, "cu": "utf8"})
}

fn f64_node(x: f64) -> Value {
    json!({"t": "f64", "v": render(x), "bits": bits(x)})
}

fn sort_pairs(p: &mut Vec<(String, Value, Value)>) {
    p.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
}

fn encj(v: &V, d: usize) -> R<Value> {
    if d > MAX_VALUE_DEPTH {
        return Err(());
    }
    let r = resolve(v)?;
    match &*r {
        V::None => Ok(json!({"t": "none"})),
        V::Bool(b) => Ok(json!({"t": "bool", "v": b})),
        V::Num(x) => Ok(f64_node(*x)),
        V::Str(s) => Ok(text_node(s)),
        V::List(items) => {
            let mut out = Vec::new();
            for i in items {
                out.push(encj(i, d + 1)?);
            }
            Ok(json!({"t": "list", "v": out}))
        }
        V::Map(es, _) => {
            let mut p = Vec::new();
            for (k, x) in es {
                p.push((k.clone(), text_node(k), encj(x, d + 1)?));
            }
            sort_pairs(&mut p);
            let out: Vec<Value> = p.into_iter().map(|(_, k, x)| Value::Array(vec![k, x])).collect();
            Ok(json!({"t": "map", "v": out}))
        }
        V::Int(_) | V::Absent => Err(()),
    }
}

fn int_node(t: &str, v: &V, lo: i128, hi: i128) -> R<Value> {
    let n: i128 = match v {
        V::Num(x) => {
            let x = *x;
            if !(x.is_finite() && x.trunc() == x) {
                return Err(());
            }
            if t == "i64" {
                if !(x >= -9223372036854775808.0 && x < 9223372036854775808.0) {
                    return Err(());
                }
            } else if !(x >= 0.0 && x < 18446744073709551616.0) {
                return Err(());
            }
            x as i128
        }
        V::Int(Some(i)) => *i,
        _ => return Err(()),
    };
    if n < lo || n > hi {
        return Err(());
    }
    Ok(json!({"t": t, "v": n.to_string()}))
}

fn enc(v: &V, ty: &Ty, d: usize) -> R<Value> {
    if d > MAX_VALUE_DEPTH {
        return Err(());
    }
    if let V::Map(es, false) = v {
        if es.len() == 1 && (es[0].0 == "__throw" || es[0].0 == "__threw") {
            if let V::Str(m) = &es[0].1 {
                return Ok(json!({"t": "throw", "msg": m}));
            }
        }
    }
    let r = resolve(v)?;
    let v: &V = &r;
    match ty {
        Ty::Union(alts) => {
            for a in alts {
                if let Ok(x) = enc(v, a, d) {
                    return Ok(x);
                }
            }
            Err(())
        }
        Ty::NoneT => match v {
            V::None | V::Absent => Ok(json!({"t": "none"})),
            _ => Err(()),
        },
        Ty::Bool => match v {
            V::Bool(b) => Ok(json!({"t": "bool", "v": b})),
            _ => Err(()),
        },
        Ty::Text => match v {
            V::Str(s) => Ok(text_node(s)),
            _ => Err(()),
        },
        Ty::F64 => match v {
            V::Num(x) => Ok(f64_node(*x)),
            _ => Err(()),
        },
        Ty::I64 => int_node("i64", v, i64::MIN as i128, i64::MAX as i128),
        Ty::U64 => int_node("u64", v, 0, u64::MAX as i128),
        Ty::Bytes => Err(()),
        Ty::Json => encj(v, d),
        Ty::Tuple(ts) => match v {
            V::List(items) if items.len() == ts.len() => {
                let mut out = Vec::new();
                for (i, t) in items.iter().zip(ts) {
                    out.push(enc(i, t, d + 1)?);
                }
                Ok(json!({"t": "tuple", "v": out}))
            }
            _ => Err(()),
        },
        Ty::List(t) => match v {
            V::List(items) => {
                let mut out = Vec::new();
                for i in items {
                    out.push(enc(i, t, d + 1)?);
                }
                Ok(json!({"t": "list", "v": out}))
            }
            _ => Err(()),
        },
        Ty::Map(kt, vt) => match v {
            V::Map(es, _) => {
                let mut p = Vec::new();
                for (k, x) in es {
                    let kn = enc(&V::Str(k.clone()), kt, d + 1)?;
                    let vn = enc(x, vt, d + 1)?;
                    p.push((k.clone(), kn, vn));
                }
                sort_pairs(&mut p);
                let out: Vec<Value> = p.into_iter().map(|(_, k, x)| Value::Array(vec![k, x])).collect();
                Ok(json!({"t": "map", "v": out}))
            }
            _ => Err(()),
        },
        Ty::Record(fs) => match v {
            V::Map(es, _) => {
                let absent = V::Absent;
                let mut out = Vec::new();
                for (n, t) in fs {
                    let x = es.iter().find(|(k, _)| k == n).map(|(_, x)| x).unwrap_or(&absent);
                    out.push(Value::Array(vec![Value::String(n.clone()), enc(x, t, d + 1)?]));
                }
                Ok(json!({"t": "record", "v": out}))
            }
            _ => Err(()),
        },
    }
}

pub fn encode_value(value: &serde_json::Value, ty: &str) -> serde_json::Value {
    let mut p = P { c: ty.chars().collect(), i: 0 };
    let t = match p.ty(0) {
        Ok(t) => t,
        Err(_) => panic!("bad type"),
    };
    if p.peek().is_some() {
        panic!("trailing type text");
    }
    let v = from_json(value);
    match enc(&v, &t, 0) {
        Ok(x) => x,
        Err(_) => panic!("throw"),
    }
}

#[allow(dead_code)]
fn _unused(_: Map<String, Value>) {}
