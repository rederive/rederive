use serde_json::{json, Value};
use std::borrow::Cow;

const MAX_VALUE_DEPTH: usize = 100;
const MAX_DEPTH: usize = 16;

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

fn conv(v: &Value) -> V {
    match v {
        Value::Null => V::Null,
        Value::Bool(b) => V::Bool(*b),
        Value::Number(n) => V::Num(n.as_f64().unwrap_or(0.0)),
        Value::String(s) => V::Str(s.clone()),
        Value::Array(a) => V::List(a.iter().map(conv).collect()),
        Value::Object(o) => V::Map(o.iter().map(|(k, x)| (k.clone(), conv(x))).collect(), false),
    }
}

#[derive(Clone)]
enum T {
    None,
    Bool,
    Text,
    Bytes,
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
    fn eat(&mut self, c: u8) -> Option<()> {
        self.ws();
        if self.peek() == Some(c) {
            self.i += 1;
            Some(())
        } else {
            None
        }
    }
    fn name(&mut self) -> Option<String> {
        self.ws();
        let s = self.i;
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
        Some(String::from_utf8_lossy(&self.b[s..self.i]).into_owned())
    }
    fn ty(&mut self, cd: usize) -> Option<T> {
        let mut alts = vec![self.alt(cd)?];
        loop {
            self.ws();
            if self.peek() == Some(b'|') {
                self.i += 1;
                alts.push(self.alt(cd)?);
            } else {
                break;
            }
        }
        if alts.len() == 1 {
            return alts.pop();
        }
        for j in 1..alts.len() {
            for i in 0..j {
                if covers(&alts[i], &alts[j]) {
                    return None;
                }
            }
        }
        Some(T::Union(alts))
    }
    fn alt(&mut self, cd: usize) -> Option<T> {
        let n = self.name()?;
        match n.as_str() {
            "text" => Some(T::Text),
            "bytes" => Some(T::Bytes),
            "bool" => Some(T::Bool),
            "none" => Some(T::None),
            "i64" => Some(T::I64),
            "u64" => Some(T::U64),
            "f64" => Some(T::F64),
            "json" => Some(T::Json),
            "tuple" | "list" | "map" | "record" => {
                self.eat(b'[')?;
                if cd >= MAX_DEPTH {
                    return None;
                }
                let r = match n.as_str() {
                    "tuple" => {
                        let mut items = vec![self.ty(cd + 1)?];
                        while self.eat(b',').is_some() {
                            items.push(self.ty(cd + 1)?);
                        }
                        T::Tuple(items)
                    }
                    "list" => T::List(Box::new(self.ty(cd + 1)?)),
                    "map" => {
                        let k = self.ty(cd + 1)?;
                        self.eat(b',')?;
                        let v = self.ty(cd + 1)?;
                        T::Map(Box::new(k), Box::new(v))
                    }
                    _ => {
                        let mut fs: Vec<(String, T)> = Vec::new();
                        loop {
                            let fname = self.name()?;
                            self.eat(b':')?;
                            let ft = self.ty(cd + 1)?;
                            if fs.iter().any(|(x, _)| *x == fname) {
                                return None;
                            }
                            fs.push((fname, ft));
                            if self.eat(b',').is_none() {
                                break;
                            }
                        }
                        T::Record(fs)
                    }
                };
                self.eat(b']')?;
                Some(r)
            }
            _ => None,
        }
    }
}

fn key(t: &T) -> String {
    match t {
        T::None => "none".into(),
        T::Bool => "bool".into(),
        T::Text => "text".into(),
        T::Bytes => "bytes".into(),
        T::I64 => "i64".into(),
        T::U64 => "u64".into(),
        T::F64 => "f64".into(),
        T::Json => "json".into(),
        T::Tuple(v) => format!("tuple[{}]", v.iter().map(key).collect::<Vec<_>>().join(",")),
        T::List(i) => format!("list[{}]", key(i)),
        T::Map(k, v) => format!("map[{},{}]", key(k), key(v)),
        T::Record(fs) => {
            let mut v: Vec<String> = fs.iter().map(|(n, t)| format!("{}:{}", n, key(t))).collect();
            v.sort();
            format!("record[{}]", v.join(","))
        }
        T::Union(a) => {
            let mut v: Vec<String> = a.iter().map(key).collect();
            v.sort();
            v.dedup();
            format!("union[{}]", v.join("|"))
        }
    }
}

fn reached(t: &T) -> bool {
    match t {
        T::None | T::Bool | T::F64 | T::Text | T::Json => true,
        T::List(i) => reached(i),
        T::Tuple(v) => v.iter().all(reached),
        T::Map(k, v) => matches!(**k, T::Text) && reached(v),
        T::Record(fs) => fs.iter().all(|(_, t)| reached(t)),
        T::Union(a) => a.iter().all(reached),
        _ => false,
    }
}

fn covers(a: &T, b: &T) -> bool {
    if key(a) == key(b) {
        return true;
    }
    if matches!(a, T::Json) && reached(b) {
        return true;
    }
    let st = match (a, b) {
        (T::List(x), T::List(y)) => covers(x, y),
        (T::Tuple(x), T::Tuple(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| covers(p, q)),
        (T::Map(k1, v1), T::Map(k2, v2)) => covers(k1, k2) && covers(v1, v2),
        (T::Record(x), T::Record(y)) => x
            .iter()
            .all(|(n, t)| y.iter().any(|(m, u)| m == n && covers(t, u))),
        _ => false,
    };
    if st {
        return true;
    }
    if let T::Union(bs) = b {
        if bs.iter().all(|x| covers(a, x)) {
            return true;
        }
    }
    if let T::Union(as_) = a {
        if as_.iter().any(|x| covers(x, b)) {
            return true;
        }
    }
    false
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
    let s = format!("{:e}", ax);
    let k = s.split('e').next().unwrap().chars().filter(|c| c.is_ascii_digit()).count();
    let s2 = format!("{:.*e}", k - 1, ax);
    let (m2, e2) = s2.split_once('e').unwrap();
    let digits: String = m2.chars().filter(|c| c.is_ascii_digit()).collect();
    let e: i32 = e2.parse().unwrap();
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
        let ex = n - 1;
        r.push('e');
        r.push(if ex >= 0 { '+' } else { '-' });
        r.push_str(&ex.abs().to_string());
        r
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

fn tn(s: &str) -> Value {
    json!({"t":"text","v":s,"cu":"utf8"})
}

fn get<'a>(m: &'a [(String, V)], k: &str) -> Option<&'a V> {
    m.iter().find(|(n, _)| n == k).map(|(_, v)| v)
}

fn num_lit(s: &str) -> Option<f64> {
    let b = s.as_bytes();
    let mut i = 0;
    if i < b.len() && b[i] == b'-' {
        i += 1;
    }
    if i >= b.len() {
        return None;
    }
    if b[i] == b'0' {
        i += 1;
    } else if b[i].is_ascii_digit() {
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
    } else {
        return None;
    }
    let digs = |i: &mut usize| -> bool {
        let s0 = *i;
        while *i < b.len() && b[*i].is_ascii_digit() {
            *i += 1;
        }
        *i > s0
    };
    if i < b.len() && b[i] == b'.' {
        i += 1;
        if !digs(&mut i) {
            return None;
        }
    }
    let mant_end = i;
    if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
        i += 1;
        if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
            i += 1;
        }
        if !digs(&mut i) {
            return None;
        }
    }
    if i != b.len() {
        return None;
    }
    let x: f64 = s.parse().ok()?;
    if x.is_infinite() {
        return None;
    }
    if x == 0.0 {
        if s[..mant_end].bytes().any(|c| (b'1'..=b'9').contains(&c)) {
            return None;
        }
        if x.is_sign_negative() {
            return None;
        }
    }
    Some(x)
}

fn big_lit(s: &str) -> Option<Option<i128>> {
    let b = s.as_bytes();
    let rest = if !b.is_empty() && b[0] == b'-' { &b[1..] } else { b };
    if rest.is_empty() {
        return None;
    }
    if rest == b"0" {
        if b.len() != 1 {
            return None;
        }
    } else {
        if !(b'1'..=b'9').contains(&rest[0]) || !rest.iter().all(|c| c.is_ascii_digit()) {
            return None;
        }
    }
    Some(s.parse::<i128>().ok())
}

fn resolve(v: &V) -> Result<Cow<'_, V>, ()> {
    if let V::Map(m, false) = v {
        if let Some(V::Str(t)) = get(m, "__t") {
            return match t.as_str() {
                "num" => match get(m, "v") {
                    Some(V::Str(s)) => {
                        let x = match s.as_str() {
                            "NaN" => f64::NAN,
                            "Infinity" => f64::INFINITY,
                            "-Infinity" => f64::NEG_INFINITY,
                            "-0" => -0.0,
                            _ => num_lit(s).ok_or(())?,
                        };
                        Ok(Cow::Owned(V::Num(x)))
                    }
                    _ => Err(()),
                },
                "bigint" => match get(m, "v") {
                    Some(V::Str(s)) => Ok(Cow::Owned(V::Int(big_lit(s).ok_or(())?))),
                    _ => Err(()),
                },
                "undef" => Ok(Cow::Owned(V::Absent)),
                "obj" => match get(m, "v") {
                    Some(V::Map(e, _)) => Ok(Cow::Owned(V::Map(e.clone(), true))),
                    _ => Err(()),
                },
                _ => Err(()),
            };
        }
    }
    Ok(Cow::Borrowed(v))
}

fn throw_of(v: &V) -> Option<&str> {
    if let V::Map(m, false) = v {
        if m.len() == 1 && (m[0].0 == "__throw" || m[0].0 == "__threw") {
            if let V::Str(s) = &m[0].1 {
                return Some(s);
            }
        }
    }
    None
}

fn sorted<'a>(m: &'a [(String, V)]) -> Vec<&'a (String, V)> {
    let mut r: Vec<&(String, V)> = m.iter().collect();
    r.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
    r
}

fn ejson(v: &V, d: usize) -> Result<Value, ()> {
    if d > MAX_VALUE_DEPTH {
        return Err(());
    }
    let r = resolve(v)?;
    match &*r {
        V::Null => Ok(json!({"t":"none"})),
        V::Bool(b) => Ok(json!({"t":"bool","v":b})),
        V::Num(x) => Ok(json!({"t":"f64","v":render(*x),"bits":bits(*x)})),
        V::Str(s) => Ok(tn(s)),
        V::List(l) => {
            let mut o = Vec::new();
            for x in l {
                o.push(ejson(x, d + 1)?);
            }
            Ok(json!({"t":"list","v":o}))
        }
        V::Map(m, _) => {
            let mut o = Vec::new();
            for (k, x) in sorted(m) {
                o.push(json!([tn(k), ejson(x, d + 1)?]));
            }
            Ok(json!({"t":"map","v":o}))
        }
        _ => Err(()),
    }
}

fn int_node(t: &str, s: String) -> Value {
    json!({"t":t,"v":s})
}

fn enc(v: &V, t: &T, d: usize) -> Result<Value, ()> {
    if d > MAX_VALUE_DEPTH {
        return Err(());
    }
    if let Some(m) = throw_of(v) {
        return Ok(json!({"t":"throw","msg":m}));
    }
    let r = resolve(v)?;
    let v: &V = &r;
    match t {
        T::Union(alts) => {
            for a in alts {
                if let Ok(x) = enc(v, a, d) {
                    return Ok(x);
                }
            }
            Err(())
        }
        T::None => match v {
            V::Null | V::Absent => Ok(json!({"t":"none"})),
            _ => Err(()),
        },
        T::Bool => match v {
            V::Bool(b) => Ok(json!({"t":"bool","v":b})),
            _ => Err(()),
        },
        T::Text => match v {
            V::Str(s) => Ok(tn(s)),
            _ => Err(()),
        },
        T::F64 => match v {
            V::Num(x) => Ok(json!({"t":"f64","v":render(*x),"bits":bits(*x)})),
            _ => Err(()),
        },
        T::I64 | T::U64 => {
            let u = matches!(t, T::U64);
            let i: i128 = match v {
                V::Num(x) => {
                    if !x.is_finite() || x.trunc() != *x {
                        return Err(());
                    }
                    if u {
                        if !(*x >= 0.0 && *x < 18446744073709551616.0) {
                            return Err(());
                        }
                    } else if !(*x >= -9223372036854775808.0 && *x < 9223372036854775808.0) {
                        return Err(());
                    }
                    *x as i128
                }
                V::Int(Some(i)) => {
                    let ok = if u {
                        *i >= 0 && *i <= u64::MAX as i128
                    } else {
                        *i >= i64::MIN as i128 && *i <= i64::MAX as i128
                    };
                    if !ok {
                        return Err(());
                    }
                    *i
                }
                _ => return Err(()),
            };
            Ok(int_node(if u { "u64" } else { "i64" }, i.to_string()))
        }
        T::Bytes => Err(()),
        T::Json => ejson(v, d),
        T::Tuple(ts) => match v {
            V::List(l) if l.len() == ts.len() => {
                let mut o = Vec::new();
                for (x, ty) in l.iter().zip(ts) {
                    o.push(enc(x, ty, d + 1)?);
                }
                Ok(json!({"t":"tuple","v":o}))
            }
            _ => Err(()),
        },
        T::List(it) => match v {
            V::List(l) => {
                let mut o = Vec::new();
                for x in l {
                    o.push(enc(x, it, d + 1)?);
                }
                Ok(json!({"t":"list","v":o}))
            }
            _ => Err(()),
        },
        T::Map(kt, vt) => match v {
            V::Map(m, _) => {
                let mut o = Vec::new();
                for (k, x) in sorted(m) {
                    let kn = enc(&V::Str(k.clone()), kt, d + 1)?;
                    let vn = enc(x, vt, d + 1)?;
                    o.push(json!([kn, vn]));
                }
                Ok(json!({"t":"map","v":o}))
            }
            _ => Err(()),
        },
        T::Record(fs) => match v {
            V::Map(m, _) => {
                let mut o = Vec::new();
                for (n, ft) in fs {
                    let absent = V::Absent;
                    let x = get(m, n).unwrap_or(&absent);
                    o.push(json!([n, enc(x, ft, d + 1)?]));
                }
                Ok(json!({"t":"record","v":o}))
            }
            _ => Err(()),
        },
    }
}

pub fn encode_value(value: &serde_json::Value, ty: &str) -> serde_json::Value {
    let mut p = P { b: ty.as_bytes(), i: 0 };
    let t = match p.ty(0) {
        Some(t) => {
            p.ws();
            if p.i != p.b.len() {
                panic!("bad type");
            }
            t
        }
        None => panic!("bad type"),
    };
    let v = conv(value);
    match enc(&v, &t, 0) {
        Ok(x) => x,
        Err(()) => panic!("encode failed"),
    }
}
