use serde_json::{json, Map, Value};
use std::cmp::Ordering;

type Res<T> = Result<T, ()>;

#[derive(Clone, Debug)]
enum Ty {
    Text,
    Bytes,
    Bool,
    Null,
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

#[derive(Clone, Debug)]
enum V {
    Absent,
    Null,
    Bool(bool),
    Num(f64),
    Int(Option<i128>),
    Text(String),
    List(Vec<V>),
    Map(Vec<(String, V)>, bool),
}

fn to_v(x: &Value) -> V {
    match x {
        Value::Null => V::Null,
        Value::Bool(b) => V::Bool(*b),
        Value::Number(n) => V::Num(n.as_f64().unwrap_or(0.0)),
        Value::String(s) => V::Text(s.clone()),
        Value::Array(a) => V::List(a.iter().map(to_v).collect()),
        Value::Object(o) => V::Map(o.iter().map(|(k, v)| (k.clone(), to_v(v))).collect(), false),
    }
}

struct P<'a> {
    b: &'a [u8],
    p: usize,
}

impl<'a> P<'a> {
    fn ws(&mut self) {
        while self.p < self.b.len() && matches!(self.b[self.p], b' ' | b'\t' | b'\r' | b'\n') {
            self.p += 1;
        }
    }
    fn name(&mut self) -> Option<String> {
        self.ws();
        let s = self.p;
        if s < self.b.len() && (self.b[s].is_ascii_alphabetic() || self.b[s] == b'_') {
            self.p += 1;
            while self.p < self.b.len() && (self.b[self.p].is_ascii_alphanumeric() || self.b[self.p] == b'_') {
                self.p += 1;
            }
            Some(String::from_utf8_lossy(&self.b[s..self.p]).into_owned())
        } else {
            None
        }
    }
    fn eat(&mut self, c: u8) -> bool {
        self.ws();
        if self.p < self.b.len() && self.b[self.p] == c {
            self.p += 1;
            true
        } else {
            false
        }
    }
    fn ty(&mut self, cd: usize) -> Res<Ty> {
        let mut alts = vec![self.alt(cd)?];
        while self.eat(b'|') {
            alts.push(self.alt(cd)?);
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
    fn alt(&mut self, cd: usize) -> Res<Ty> {
        let n = self.name().ok_or(())?;
        match n.as_str() {
            "text" => Ok(Ty::Text),
            "bytes" => Ok(Ty::Bytes),
            "bool" => Ok(Ty::Bool),
            "none" => Ok(Ty::Null),
            "i64" => Ok(Ty::I64),
            "u64" => Ok(Ty::U64),
            "f64" => Ok(Ty::F64),
            "json" => Ok(Ty::Json),
            "tuple" | "list" | "map" | "record" => {
                if cd >= 16 || !self.eat(b'[') {
                    return Err(());
                }
                match n.as_str() {
                    "tuple" => {
                        let mut items = vec![];
                        loop {
                            items.push(self.ty(cd + 1)?);
                            if self.eat(b',') {
                                continue;
                            }
                            if self.eat(b']') {
                                break;
                            }
                            return Err(());
                        }
                        Ok(Ty::Tuple(items))
                    }
                    "list" => {
                        let t = self.ty(cd + 1)?;
                        if !self.eat(b']') {
                            return Err(());
                        }
                        Ok(Ty::List(Box::new(t)))
                    }
                    "map" => {
                        let k = self.ty(cd + 1)?;
                        if !self.eat(b',') {
                            return Err(());
                        }
                        let v = self.ty(cd + 1)?;
                        if !self.eat(b']') {
                            return Err(());
                        }
                        Ok(Ty::Map(Box::new(k), Box::new(v)))
                    }
                    _ => {
                        let mut fields: Vec<(String, Ty)> = vec![];
                        loop {
                            let fname = self.name().ok_or(())?;
                            if !self.eat(b':') {
                                return Err(());
                            }
                            let t = self.ty(cd + 1)?;
                            if fields.iter().any(|(n, _)| *n == fname) {
                                return Err(());
                            }
                            fields.push((fname, t));
                            if self.eat(b',') {
                                continue;
                            }
                            if self.eat(b']') {
                                break;
                            }
                            return Err(());
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
        Ty::Null => "none".into(),
        Ty::I64 => "i64".into(),
        Ty::U64 => "u64".into(),
        Ty::F64 => "f64".into(),
        Ty::Json => "json".into(),
        Ty::Tuple(a) => format!("tuple[{}]", a.iter().map(key).collect::<Vec<_>>().join(",")),
        Ty::List(a) => format!("list[{}]", key(a)),
        Ty::Map(k, v) => format!("map[{},{}]", key(k), key(v)),
        Ty::Record(f) => {
            let mut s: Vec<String> = f.iter().map(|(n, t)| format!("{}:{}", n, key(t))).collect();
            s.sort();
            format!("record[{}]", s.join(","))
        }
        Ty::Union(a) => {
            let mut s: Vec<String> = a.iter().map(key).collect();
            s.sort();
            format!("union[{}]", s.join(","))
        }
    }
}

fn jr(t: &Ty) -> bool {
    match t {
        Ty::Null | Ty::Bool | Ty::F64 | Ty::Text | Ty::Json => true,
        Ty::List(i) => jr(i),
        Ty::Tuple(a) => a.iter().all(jr),
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
    let st = match (a, b) {
        (Ty::List(x), Ty::List(y)) => covers(x, y),
        (Ty::Tuple(x), Ty::Tuple(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| covers(p, q)),
        (Ty::Map(k1, v1), Ty::Map(k2, v2)) => covers(k1, k2) && covers(v1, v2),
        (Ty::Record(x), Ty::Record(y)) => x
            .iter()
            .all(|(n, t)| y.iter().any(|(n2, t2)| n == n2 && covers(t, t2))),
        _ => false,
    };
    if st {
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
    let mant = s.split('e').next().unwrap();
    let k = mant.chars().filter(|c| c.is_ascii_digit()).count();
    let t = format!("{:.*e}", k - 1, ax);
    let mut it = t.split('e');
    let m = it.next().unwrap();
    let e: i32 = it.next().unwrap().parse().unwrap();
    let d: String = m.chars().filter(|c| c.is_ascii_digit()).collect();
    let n = e + 1;
    let k = k as i32;
    let body = if k <= n && n <= 21 {
        format!("{}{}", d, "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &d[..n as usize], &d[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{}", "0".repeat((-n) as usize), d)
    } else {
        let sign = if n - 1 < 0 { "-" } else { "+" };
        let ex = (n - 1).abs();
        if k > 1 {
            format!("{}.{}e{}{}", &d[..1], &d[1..], sign, ex)
        } else {
            format!("{}e{}{}", d, sign, ex)
        }
    };
    if x < 0.0 {
        format!("-{}", body)
    } else {
        body
    }
}

fn f64node(x: f64) -> Value {
    let bits = if x.is_nan() { "7ff8000000000000".to_string() } else { format!("{:016x}", x.to_bits()) };
    json!({"t":"f64","v":render(x),"bits":bits})
}

fn textnode(s: &str) -> Value {
    json!({"t":"text","v":s,"cu":"utf8"})
}

fn num_literal_ok(s: &[u8]) -> bool {
    let mut i = 0;
    if i < s.len() && s[i] == b'-' {
        i += 1;
    }
    if i >= s.len() {
        return false;
    }
    if s[i] == b'0' {
        i += 1;
    } else if s[i].is_ascii_digit() {
        while i < s.len() && s[i].is_ascii_digit() {
            i += 1;
        }
    } else {
        return false;
    }
    if i < s.len() && s[i] == b'.' {
        i += 1;
        let st = i;
        while i < s.len() && s[i].is_ascii_digit() {
            i += 1;
        }
        if i == st {
            return false;
        }
    }
    if i < s.len() && (s[i] == b'e' || s[i] == b'E') {
        i += 1;
        if i < s.len() && (s[i] == b'+' || s[i] == b'-') {
            i += 1;
        }
        let st = i;
        while i < s.len() && s[i].is_ascii_digit() {
            i += 1;
        }
        if i == st {
            return false;
        }
    }
    i == s.len()
}

fn parse_num(s: &str) -> Res<f64> {
    match s {
        "NaN" => return Ok(f64::NAN),
        "Infinity" => return Ok(f64::INFINITY),
        "-Infinity" => return Ok(f64::NEG_INFINITY),
        "-0" => return Ok(-0.0),
        _ => {}
    }
    if !num_literal_ok(s.as_bytes()) {
        return Err(());
    }
    let x: f64 = s.parse().map_err(|_| ())?;
    if x.is_infinite() {
        return Err(());
    }
    if x == 0.0 {
        let mant = s.split(|c| c == 'e' || c == 'E').next().unwrap();
        if mant.bytes().any(|c| (b'1'..=b'9').contains(&c)) || x.is_sign_negative() {
            return Err(());
        }
    }
    Ok(x)
}

fn parse_big(s: &str) -> Res<Option<i128>> {
    let b = s.as_bytes();
    let ok = if s == "0" {
        true
    } else {
        let r = if !b.is_empty() && b[0] == b'-' { &b[1..] } else { b };
        !r.is_empty() && (b'1'..=b'9').contains(&r[0]) && r.iter().all(|c| c.is_ascii_digit())
    };
    if !ok {
        return Err(());
    }
    Ok(s.parse::<i128>().ok())
}

fn member<'a>(m: &'a [(String, V)], k: &str) -> Option<&'a V> {
    m.iter().find(|(n, _)| n == k).map(|(_, v)| v)
}

fn resolve(v: &V) -> Res<Option<V>> {
    if let V::Map(m, false) = v {
        if let Some(V::Text(tag)) = member(m, "__t") {
            let payload = member(m, "v");
            return match tag.as_str() {
                "num" => match payload {
                    Some(V::Text(s)) => Ok(Some(V::Num(parse_num(s)?))),
                    _ => Err(()),
                },
                "bigint" => match payload {
                    Some(V::Text(s)) => Ok(Some(V::Int(parse_big(s)?))),
                    _ => Err(()),
                },
                "undef" => Ok(Some(V::Absent)),
                "obj" => match payload {
                    Some(V::Map(e, _)) => Ok(Some(V::Map(e.clone(), true))),
                    _ => Err(()),
                },
                _ => Err(()),
            };
        }
    }
    Ok(None)
}

fn throw_obs(v: &V) -> Option<String> {
    if let V::Map(m, false) = v {
        if m.len() == 1 && (m[0].0 == "__throw" || m[0].0 == "__threw") {
            if let V::Text(s) = &m[0].1 {
                return Some(s.clone());
            }
        }
    }
    None
}

fn u16cmp(a: &str, b: &str) -> Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

fn esc(s: &str) -> String {
    let mut o = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\u{8}' => o.push_str("\\b"),
            '\t' => o.push_str("\\t"),
            '\n' => o.push_str("\\n"),
            '\u{c}' => o.push_str("\\f"),
            '\r' => o.push_str("\\r"),
            c if (c as u32) < 32 => o.push_str(&format!("\\u00{:02x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

fn canon(n: &Value) -> String {
    match n {
        Value::Object(o) => {
            let t = o.get("t").and_then(|x| x.as_str());
            let mut ents: Vec<(&String, Value)> = Vec::new();
            for (k, v) in o.iter() {
                if t == Some("f64") && k != "bits" && k != "t" {
                    continue;
                }
                if t == Some("throw") && k != "t" {
                    continue;
                }
                ents.push((k, v.clone()));
            }
            ents.sort_by(|a, b| u16cmp(a.0, b.0));
            let parts: Vec<String> = ents.iter().map(|(k, v)| format!("{}:{}", esc(k), canon(v))).collect();
            format!("{{{}}}", parts.join(","))
        }
        Value::Array(a) => format!("[{}]", a.iter().map(canon).collect::<Vec<_>>().join(",")),
        Value::String(s) => esc(s),
        Value::Bool(b) => b.to_string(),
        _ => "null".into(),
    }
}

fn sort_key(n: &Value) -> String {
    if n.get("t").and_then(|x| x.as_str()) == Some("text") {
        if let Some(s) = n.get("v").and_then(|x| x.as_str()) {
            return s.to_string();
        }
    }
    canon(n)
}

fn finish_pairs(mut ps: Vec<(String, Value)>) -> Vec<Value> {
    ps.sort_by(|a, b| u16cmp(&a.0, &b.0));
    ps.into_iter().map(|(_, p)| p).collect()
}

const MAXV: usize = 100;

fn jn(v: &V, d: usize) -> Res<Value> {
    if d > MAXV {
        return Err(());
    }
    let r = resolve(v)?;
    let v = r.as_ref().unwrap_or(v);
    match v {
        V::Null => Ok(json!({"t":"none"})),
        V::Bool(b) => Ok(json!({"t":"bool","v":b})),
        V::Num(x) => Ok(f64node(*x)),
        V::Text(s) => Ok(textnode(s)),
        V::List(items) => {
            let mut o = vec![];
            for i in items {
                o.push(jn(i, d + 1)?);
            }
            Ok(json!({"t":"list","v":o}))
        }
        V::Map(m, _) => {
            let mut ps = vec![];
            for (k, x) in m {
                let kn = textnode(k);
                let vn = jn(x, d + 1)?;
                ps.push((k.clone(), json!([kn, vn])));
            }
            Ok(json!({"t":"map","v":finish_pairs(ps)}))
        }
        _ => Err(()),
    }
}

fn enc(v: &V, ty: &Ty, d: usize) -> Res<Value> {
    if d > MAXV {
        return Err(());
    }
    if let Some(m) = throw_obs(v) {
        return Ok(json!({"t":"throw","msg":m}));
    }
    let r = resolve(v)?;
    let v = r.as_ref().unwrap_or(v);
    core(v, ty, d)
}

fn core(v: &V, ty: &Ty, d: usize) -> Res<Value> {
    match ty {
        Ty::Union(alts) => {
            for a in alts {
                if let Ok(n) = core(v, a, d) {
                    return Ok(n);
                }
            }
            Err(())
        }
        Ty::Null => match v {
            V::Null | V::Absent => Ok(json!({"t":"none"})),
            _ => Err(()),
        },
        Ty::Bool => match v {
            V::Bool(b) => Ok(json!({"t":"bool","v":b})),
            _ => Err(()),
        },
        Ty::Text => match v {
            V::Text(s) => Ok(textnode(s)),
            _ => Err(()),
        },
        Ty::F64 => match v {
            V::Num(x) => Ok(f64node(*x)),
            _ => Err(()),
        },
        Ty::Bytes => Err(()),
        Ty::I64 | Ty::U64 => {
            let signed = matches!(ty, Ty::I64);
            let val: i128 = match v {
                V::Num(x) => {
                    let x = *x;
                    if !x.is_finite() || x.trunc() != x {
                        return Err(());
                    }
                    let ok = if signed {
                        x >= -9223372036854775808.0 && x < 9223372036854775808.0
                    } else {
                        x >= 0.0 && x < 18446744073709551616.0
                    };
                    if !ok {
                        return Err(());
                    }
                    x as i128
                }
                V::Int(Some(i)) => {
                    let ok = if signed {
                        *i >= i64::MIN as i128 && *i <= i64::MAX as i128
                    } else {
                        *i >= 0 && *i <= u64::MAX as i128
                    };
                    if !ok {
                        return Err(());
                    }
                    *i
                }
                _ => return Err(()),
            };
            Ok(json!({"t": if signed {"i64"} else {"u64"}, "v": val.to_string()}))
        }
        Ty::Json => jn(v, d),
        Ty::Tuple(ts) => match v {
            V::List(items) if items.len() == ts.len() => {
                let mut o = vec![];
                for (i, t) in items.iter().zip(ts) {
                    o.push(enc(i, t, d + 1)?);
                }
                Ok(json!({"t":"tuple","v":o}))
            }
            _ => Err(()),
        },
        Ty::List(t) => match v {
            V::List(items) => {
                let mut o = vec![];
                for i in items {
                    o.push(enc(i, t, d + 1)?);
                }
                Ok(json!({"t":"list","v":o}))
            }
            _ => Err(()),
        },
        Ty::Map(kt, vt) => match v {
            V::Map(m, _) => {
                let mut ps = vec![];
                for (k, x) in m {
                    let kn = enc(&V::Text(k.clone()), kt, d + 1)?;
                    let vn = enc(x, vt, d + 1)?;
                    ps.push((sort_key(&kn), json!([kn, vn])));
                }
                Ok(json!({"t":"map","v":finish_pairs(ps)}))
            }
            _ => Err(()),
        },
        Ty::Record(fs) => match v {
            V::Map(m, _) => {
                let mut o = vec![];
                for (n, t) in fs {
                    let absent = V::Absent;
                    let fv = member(m, n).unwrap_or(&absent);
                    o.push(json!([n, enc(fv, t, d + 1)?]));
                }
                Ok(json!({"t":"record","v":o}))
            }
            _ => Err(()),
        },
    }
}

pub fn encode_value(value: &serde_json::Value, ty: &str) -> serde_json::Value {
    let mut p = P { b: ty.as_bytes(), p: 0 };
    let t = match p.ty(0) {
        Ok(t) => t,
        Err(_) => panic!("bad type"),
    };
    p.ws();
    if p.p != p.b.len() {
        panic!("bad type");
    }
    let v = to_v(value);
    match enc(&v, &t, 0) {
        Ok(n) => n,
        Err(_) => panic!("encode throw"),
    }
}

#[allow(dead_code)]
fn _unused(_: Map<String, Value>) {}
