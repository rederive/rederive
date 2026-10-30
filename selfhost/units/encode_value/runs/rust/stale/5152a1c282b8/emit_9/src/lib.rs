use serde_json::{json, Map, Value};

const MAX_VALUE_DEPTH: usize = 100;
const MAX_DEPTH: usize = 16;

enum V {
    Absent,
    Null,
    Bool(bool),
    Num(f64),
    Int(Option<i128>),
    Str(String),
    List(Vec<V>),
    Obj(Vec<(String, V)>, bool),
}

#[derive(Clone)]
enum Ty {
    None,
    Bool,
    Text,
    Bytes,
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

fn conv(v: &Value) -> V {
    match v {
        Value::Null => V::Null,
        Value::Bool(b) => V::Bool(*b),
        Value::Number(n) => V::Num(n.as_f64().unwrap_or(f64::NAN)),
        Value::String(s) => V::Str(s.clone()),
        Value::Array(a) => V::List(a.iter().map(conv).collect()),
        Value::Object(o) => V::Obj(o.iter().map(|(k, x)| (k.clone(), conv(x))).collect(), false),
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
    fn expect(&mut self, c: u8) {
        self.ws();
        if self.peek() == Some(c) {
            self.i += 1;
        } else {
            panic!("type syntax");
        }
    }
    fn name(&mut self) -> String {
        self.ws();
        let st = self.i;
        match self.peek() {
            Some(c) if c.is_ascii_alphabetic() || c == b'_' => self.i += 1,
            _ => panic!("type syntax"),
        }
        while let Some(c) = self.peek() {
            if c.is_ascii_alphanumeric() || c == b'_' {
                self.i += 1;
            } else {
                break;
            }
        }
        String::from_utf8(self.b[st..self.i].to_vec()).unwrap()
    }
    fn ty(&mut self, depth: usize) -> Ty {
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
                    panic!("unreachable alternative");
                }
            }
        }
        Ty::Union(alts)
    }
    fn alt(&mut self, depth: usize) -> Ty {
        let n = self.name();
        match n.as_str() {
            "text" => Ty::Text,
            "bytes" => Ty::Bytes,
            "bool" => Ty::Bool,
            "none" => Ty::None,
            "i64" => Ty::I64,
            "u64" => Ty::U64,
            "f64" => Ty::F64,
            "json" => Ty::Json,
            "tuple" | "list" | "map" | "record" => {
                if depth >= MAX_DEPTH {
                    panic!("type too deep");
                }
                self.expect(b'[');
                let r = match n.as_str() {
                    "tuple" => {
                        let mut items = vec![self.ty(depth + 1)];
                        loop {
                            self.ws();
                            if self.peek() == Some(b',') {
                                self.i += 1;
                                items.push(self.ty(depth + 1));
                            } else {
                                break;
                            }
                        }
                        Ty::Tuple(items)
                    }
                    "list" => Ty::List(Box::new(self.ty(depth + 1))),
                    "map" => {
                        let k = self.ty(depth + 1);
                        self.expect(b',');
                        let v = self.ty(depth + 1);
                        Ty::Map(Box::new(k), Box::new(v))
                    }
                    _ => {
                        let mut fs: Vec<(String, Ty)> = Vec::new();
                        loop {
                            let fname = self.name();
                            if fs.iter().any(|(x, _)| *x == fname) {
                                panic!("duplicate field");
                            }
                            self.expect(b':');
                            let t = self.ty(depth + 1);
                            fs.push((fname, t));
                            self.ws();
                            if self.peek() == Some(b',') {
                                self.i += 1;
                            } else {
                                break;
                            }
                        }
                        Ty::Record(fs)
                    }
                };
                self.expect(b']');
                r
            }
            _ => panic!("unknown type name"),
        }
    }
}

fn key(t: &Ty) -> String {
    match t {
        Ty::None => "none".into(),
        Ty::Bool => "bool".into(),
        Ty::Text => "text".into(),
        Ty::Bytes => "bytes".into(),
        Ty::I64 => "i64".into(),
        Ty::U64 => "u64".into(),
        Ty::F64 => "f64".into(),
        Ty::Json => "json".into(),
        Ty::Tuple(v) => format!("tuple[{}]", v.iter().map(key).collect::<Vec<_>>().join(",")),
        Ty::List(i) => format!("list[{}]", key(i)),
        Ty::Map(k, v) => format!("map[{},{}]", key(k), key(v)),
        Ty::Record(fs) => {
            let mut v: Vec<String> = fs.iter().map(|(n, t)| format!("{}:{}", n, key(t))).collect();
            v.sort();
            format!("record[{}]", v.join(","))
        }
        Ty::Union(alts) => {
            let mut v: Vec<String> = alts.iter().map(key).collect();
            v.sort();
            v.dedup();
            format!("union[{}]", v.join("|"))
        }
    }
}

fn jr(t: &Ty) -> bool {
    match t {
        Ty::None | Ty::Bool | Ty::F64 | Ty::Text | Ty::Json => true,
        Ty::List(i) => jr(i),
        Ty::Tuple(v) => v.iter().all(jr),
        Ty::Map(k, v) => matches!(**k, Ty::Text) && jr(v),
        Ty::Record(fs) => fs.iter().all(|(_, t)| jr(t)),
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
    match (a, b) {
        (Ty::List(x), Ty::List(y)) if covers(x, y) => return true,
        (Ty::Tuple(x), Ty::Tuple(y)) if x.len() == y.len() && x.iter().zip(y).all(|(p, q)| covers(p, q)) => {
            return true
        }
        (Ty::Map(k1, v1), Ty::Map(k2, v2)) if covers(k1, k2) && covers(v1, v2) => return true,
        (Ty::Record(x), Ty::Record(y))
            if x.iter().all(|(n, t)| y.iter().any(|(m, u)| m == n && covers(t, u))) =>
        {
            return true
        }
        _ => {}
    }
    if let Ty::Union(bs) = b {
        if bs.iter().all(|alt| covers(a, alt)) {
            return true;
        }
    }
    if let Ty::Union(as_) = a {
        if as_.iter().any(|alt| covers(alt, b)) {
            return true;
        }
    }
    false
}

fn get<'a>(m: &'a [(String, V)], k: &str) -> Option<&'a V> {
    m.iter().find(|(n, _)| n == k).map(|(_, v)| v)
}

fn parse_num(s: &str) -> Result<f64, ()> {
    match s {
        "NaN" => return Ok(f64::NAN),
        "Infinity" => return Ok(f64::INFINITY),
        "-Infinity" => return Ok(f64::NEG_INFINITY),
        "-0" => return Ok(-0.0),
        _ => {}
    }
    let b = s.as_bytes();
    let mut i = 0;
    if b.get(i) == Some(&b'-') {
        i += 1;
    }
    match b.get(i) {
        Some(b'0') => i += 1,
        Some(c) if (b'1'..=b'9').contains(c) => {
            i += 1;
            while b.get(i).map_or(false, |c| c.is_ascii_digit()) {
                i += 1;
            }
        }
        _ => return Err(()),
    }
    if b.get(i) == Some(&b'.') {
        i += 1;
        let st = i;
        while b.get(i).map_or(false, |c| c.is_ascii_digit()) {
            i += 1;
        }
        if i == st {
            return Err(());
        }
    }
    let mant_end = i;
    if matches!(b.get(i), Some(b'e') | Some(b'E')) {
        i += 1;
        if matches!(b.get(i), Some(b'+') | Some(b'-')) {
            i += 1;
        }
        let st = i;
        while b.get(i).map_or(false, |c| c.is_ascii_digit()) {
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
        if b[..mant_end].iter().any(|c| (b'1'..=b'9').contains(c)) {
            return Err(());
        }
        if x.is_sign_negative() {
            return Err(());
        }
    }
    Ok(x)
}

fn parse_big(s: &str) -> Result<Option<i128>, ()> {
    let b = s.as_bytes();
    if s == "0" {
        return Ok(Some(0));
    }
    let d = if b.first() == Some(&b'-') { &b[1..] } else { b };
    if d.is_empty() || !(b'1'..=b'9').contains(&d[0]) || !d.iter().all(|c| c.is_ascii_digit()) {
        return Err(());
    }
    Ok(s.parse::<i128>().ok())
}

fn resolve(v: &V) -> Result<Option<V>, ()> {
    if let V::Obj(m, false) = v {
        if let Some(V::Str(t)) = get(m, "__t") {
            return match t.as_str() {
                "num" => match get(m, "v") {
                    Some(V::Str(s)) => Ok(Some(V::Num(parse_num(s)?))),
                    _ => Err(()),
                },
                "bigint" => match get(m, "v") {
                    Some(V::Str(s)) => Ok(Some(V::Int(parse_big(s)?))),
                    _ => Err(()),
                },
                "undef" => Ok(Some(V::Absent)),
                "obj" => match get(m, "v") {
                    Some(V::Obj(e, _)) => Ok(Some(V::Obj(clone_entries(e), true))),
                    _ => Err(()),
                },
                _ => Err(()),
            };
        }
    }
    Ok(None)
}

fn clone_entries(e: &[(String, V)]) -> Vec<(String, V)> {
    e.iter().map(|(k, x)| (k.clone(), clone_v(x))).collect()
}

fn clone_v(v: &V) -> V {
    match v {
        V::Absent => V::Absent,
        V::Null => V::Null,
        V::Bool(b) => V::Bool(*b),
        V::Num(x) => V::Num(*x),
        V::Int(i) => V::Int(*i),
        V::Str(s) => V::Str(s.clone()),
        V::List(l) => V::List(l.iter().map(clone_v).collect()),
        V::Obj(m, f) => V::Obj(clone_entries(m), *f),
    }
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
    let mant = s.split('e').next().unwrap();
    let k = mant.chars().filter(|c| c.is_ascii_digit()).count();
    let s2 = format!("{:.*e}", k - 1, ax);
    let mut parts = s2.split('e');
    let digits: String = parts.next().unwrap().chars().filter(|c| c.is_ascii_digit()).collect();
    let e: i32 = parts.next().unwrap().parse().unwrap();
    let n = e + 1;
    let ki = k as i32;
    let body = if ki <= n && n <= 21 {
        format!("{}{}", digits, "0".repeat((n - ki) as usize))
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
        r.push(if n - 1 >= 0 { '+' } else { '-' });
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

fn canon(n: &Value) -> String {
    match n {
        Value::Object(m) => {
            let t = m.get("t").and_then(|x| x.as_str()).unwrap_or("");
            if t == "f64" {
                return format!("{{\"bits\":{},\"t\":\"f64\"}}", canon(&m["bits"]));
            }
            if t == "throw" {
                return "{\"t\":\"throw\"}".into();
            }
            let mut ks: Vec<&String> = m.keys().collect();
            ks.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            let parts: Vec<String> = ks
                .iter()
                .map(|k| format!("{}:{}", Value::String((*k).clone()), canon(&m[*k])))
                .collect();
            format!("{{{}}}", parts.join(","))
        }
        Value::Array(a) => format!("[{}]", a.iter().map(canon).collect::<Vec<_>>().join(",")),
        other => other.to_string(),
    }
}

fn sort_key(n: &Value) -> String {
    if n.get("t").and_then(|x| x.as_str()) == Some("text") {
        return n["v"].as_str().unwrap_or("").to_string();
    }
    canon(n)
}

fn sort_pairs(mut v: Vec<(String, Value)>) -> Vec<Value> {
    v.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
    v.into_iter().map(|(_, p)| p).collect()
}

type R = Result<Value, ()>;

fn throw_obs(v: &V) -> Option<Value> {
    if let V::Obj(m, false) = v {
        if m.len() == 1 && (m[0].0 == "__throw" || m[0].0 == "__threw") {
            if let V::Str(s) = &m[0].1 {
                return Some(json!({"t": "throw", "msg": s}));
            }
        }
    }
    None
}

fn int_str(v: &V, lo: i128, hi: i128) -> Option<String> {
    let i = match v {
        V::Num(x) => {
            if !x.is_finite() || x.trunc() != *x || x.abs() >= 1e30 {
                return None;
            }
            *x as i128
        }
        V::Int(Some(i)) => *i,
        _ => return None,
    };
    if i < lo || i > hi {
        return None;
    }
    Some(i.to_string())
}

fn enc_json(v: &V, d: usize) -> R {
    if d > MAX_VALUE_DEPTH {
        return Err(());
    }
    let r = resolve(v)?;
    let v = r.as_ref().unwrap_or(v);
    match v {
        V::Null => Ok(json!({"t": "none"})),
        V::Bool(b) => Ok(json!({"t": "bool", "v": b})),
        V::Num(x) => Ok(f64_node(*x)),
        V::Str(s) => Ok(text_node(s)),
        V::List(l) => {
            let mut out = Vec::new();
            for x in l {
                out.push(enc_json(x, d + 1)?);
            }
            Ok(json!({"t": "list", "v": out}))
        }
        V::Obj(m, _) => {
            let mut ps = Vec::new();
            for (k, x) in m {
                let vn = enc_json(x, d + 1)?;
                ps.push((k.clone(), Value::Array(vec![text_node(k), vn])));
            }
            Ok(json!({"t": "map", "v": sort_pairs(ps)}))
        }
        _ => Err(()),
    }
}

fn enc(v: &V, ty: &Ty, d: usize) -> R {
    if d > MAX_VALUE_DEPTH {
        return Err(());
    }
    if let Some(n) = throw_obs(v) {
        return Ok(n);
    }
    let r = resolve(v)?;
    let v = r.as_ref().unwrap_or(v);
    match ty {
        Ty::None => match v {
            V::Null | V::Absent => Ok(json!({"t": "none"})),
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
        Ty::I64 => int_str(v, -(1i128 << 63), (1i128 << 63) - 1)
            .map(|s| json!({"t": "i64", "v": s}))
            .ok_or(()),
        Ty::U64 => int_str(v, 0, (1i128 << 64) - 1)
            .map(|s| json!({"t": "u64", "v": s}))
            .ok_or(()),
        Ty::Bytes => Err(()),
        Ty::Json => enc_json(v, d),
        Ty::Tuple(ts) => match v {
            V::List(l) if l.len() == ts.len() => {
                let mut out = Vec::new();
                for (x, t) in l.iter().zip(ts) {
                    out.push(enc(x, t, d + 1)?);
                }
                Ok(json!({"t": "tuple", "v": out}))
            }
            _ => Err(()),
        },
        Ty::List(t) => match v {
            V::List(l) => {
                let mut out = Vec::new();
                for x in l {
                    out.push(enc(x, t, d + 1)?);
                }
                Ok(json!({"t": "list", "v": out}))
            }
            _ => Err(()),
        },
        Ty::Map(kt, vt) => match v {
            V::Obj(m, _) => {
                let mut ps = Vec::new();
                for (k, x) in m {
                    let kn = enc(&V::Str(k.clone()), kt, d + 1)?;
                    let vn = enc(x, vt, d + 1)?;
                    ps.push((sort_key(&kn), Value::Array(vec![kn, vn])));
                }
                Ok(json!({"t": "map", "v": sort_pairs(ps)}))
            }
            _ => Err(()),
        },
        Ty::Record(fs) => match v {
            V::Obj(m, _) => {
                let mut out = Vec::new();
                for (name, t) in fs {
                    let n = match get(m, name) {
                        Some(x) => enc(x, t, d + 1)?,
                        None => enc(&V::Absent, t, d + 1)?,
                    };
                    out.push(Value::Array(vec![Value::String(name.clone()), n]));
                }
                Ok(json!({"t": "record", "v": out}))
            }
            _ => Err(()),
        },
        Ty::Union(alts) => {
            for a in alts {
                if let Ok(n) = enc(v, a, d) {
                    return Ok(n);
                }
            }
            Err(())
        }
    }
}

pub fn encode_value(value: &serde_json::Value, ty: &str) -> serde_json::Value {
    let mut p = P { b: ty.as_bytes(), i: 0 };
    let t = p.ty(0);
    p.ws();
    if p.i != p.b.len() {
        panic!("trailing type text");
    }
    let v = conv(value);
    match enc(&v, &t, 0) {
        Ok(n) => n,
        Err(()) => panic!("throw"),
    }
}

#[allow(dead_code)]
fn _unused(_: Map<String, Value>) {}
