use serde_json::{json, Map, Value};

#[derive(Clone)]
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

#[derive(Clone, PartialEq)]
enum Ty {
    Text,
    Bytes,
    Bool,
    None,
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

type R<T> = Result<T, ()>;

fn conv(v: &Value) -> V {
    match v {
        Value::Null => V::Null,
        Value::Bool(b) => V::Bool(*b),
        Value::Number(n) => V::Num(n.as_f64().unwrap_or(0.0)),
        Value::String(s) => V::Text(s.clone()),
        Value::Array(a) => V::List(a.iter().map(conv).collect()),
        Value::Object(o) => V::Map(o.iter().map(|(k, x)| (k.clone(), conv(x))).collect(), false),
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
    fn eat(&mut self, c: u8) -> R<()> {
        self.ws();
        if self.i < self.s.len() && self.s[self.i] == c {
            self.i += 1;
            Ok(())
        } else {
            Err(())
        }
    }
    fn peek(&mut self, c: u8) -> bool {
        self.ws();
        self.i < self.s.len() && self.s[self.i] == c
    }
    fn name(&mut self) -> R<String> {
        self.ws();
        let st = self.i;
        if self.i < self.s.len() && (self.s[self.i].is_ascii_alphabetic() || self.s[self.i] == b'_') {
            self.i += 1;
            while self.i < self.s.len() && (self.s[self.i].is_ascii_alphanumeric() || self.s[self.i] == b'_') {
                self.i += 1;
            }
            Ok(String::from_utf8_lossy(&self.s[st..self.i]).into_owned())
        } else {
            Err(())
        }
    }
    fn ty(&mut self, d: usize) -> R<Ty> {
        let mut alts = vec![self.alt(d)?];
        while self.peek(b'|') {
            self.i += 1;
            alts.push(self.alt(d)?);
        }
        if alts.len() == 1 {
            return Ok(alts.pop().unwrap());
        }
        for a in 0..alts.len() {
            for b in a + 1..alts.len() {
                if alts[a] == alts[b] {
                    return Err(());
                }
            }
        }
        Ok(Ty::Union(alts))
    }
    fn alt(&mut self, d: usize) -> R<Ty> {
        let n = self.name()?;
        let simple = match n.as_str() {
            "text" => Some(Ty::Text),
            "bytes" => Some(Ty::Bytes),
            "bool" => Some(Ty::Bool),
            "none" => Some(Ty::None),
            "i64" => Some(Ty::I64),
            "u64" => Some(Ty::U64),
            "f64" => Some(Ty::F64),
            "json" => Some(Ty::Json),
            _ => None,
        };
        if let Some(t) = simple {
            return Ok(t);
        }
        if !matches!(n.as_str(), "tuple" | "list" | "map" | "record") {
            return Err(());
        }
        if d + 1 > 256 {
            return Err(());
        }
        let d = d + 1;
        self.eat(b'[')?;
        let t = match n.as_str() {
            "tuple" => {
                let mut v = vec![self.ty(d)?];
                while self.peek(b',') {
                    self.i += 1;
                    v.push(self.ty(d)?);
                }
                Ty::Tuple(v)
            }
            "list" => Ty::List(Box::new(self.ty(d)?)),
            "map" => {
                let k = self.ty(d)?;
                self.eat(b',')?;
                let v = self.ty(d)?;
                Ty::Map(Box::new(k), Box::new(v))
            }
            _ => {
                let mut fs: Vec<(String, Ty)> = Vec::new();
                loop {
                    let nm = self.name()?;
                    if fs.iter().any(|(x, _)| *x == nm) {
                        return Err(());
                    }
                    self.eat(b':')?;
                    let t = self.ty(d)?;
                    fs.push((nm, t));
                    if self.peek(b',') {
                        self.i += 1;
                    } else {
                        break;
                    }
                }
                Ty::Record(fs)
            }
        };
        self.eat(b']')?;
        Ok(t)
    }
}

fn parse_type(s: &str) -> R<Ty> {
    let mut p = P { s: s.as_bytes(), i: 0 };
    let t = p.ty(0)?;
    p.ws();
    if p.i != p.s.len() {
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
    let k = short.split('e').next().unwrap().chars().filter(|c| c.is_ascii_digit()).count();
    let full = format!("{:.*e}", k - 1, a);
    let mut it = full.split('e');
    let mant = it.next().unwrap();
    let e: i32 = it.next().unwrap().parse().unwrap();
    let d: String = mant.chars().filter(|c| c.is_ascii_digit()).collect();
    let k = d.len() as i32;
    let n = e + 1;
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

fn f64_node(x: f64) -> Value {
    let bits = if x.is_nan() { "7ff8000000000000".to_string() } else { format!("{:016x}", x.to_bits()) };
    json!({"t": "f64", "v": render(x), "bits": bits})
}

fn get<'a>(e: &'a [(String, V)], k: &str) -> Option<&'a V> {
    e.iter().find(|(x, _)| x == k).map(|(_, v)| v)
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

fn bigint_ok(s: &str) -> bool {
    if s == "0" {
        return true;
    }
    let t = s.strip_prefix('-').unwrap_or(s);
    let b = t.as_bytes();
    !b.is_empty() && (b'1'..=b'9').contains(&b[0]) && b.iter().all(|c| c.is_ascii_digit())
}

fn resolve(v: &V) -> R<Option<V>> {
    if let V::Map(e, false) = v {
        if let Some(V::Text(tag)) = get(e, "__t") {
            return match tag.as_str() {
                "num" => match get(e, "v") {
                    Some(V::Text(s)) => Ok(Some(V::Num(match s.as_str() {
                        "NaN" => f64::NAN,
                        "Infinity" => f64::INFINITY,
                        "-Infinity" => f64::NEG_INFINITY,
                        "-0" => -0.0,
                        _ => {
                            if !num_literal(s) {
                                return Err(());
                            }
                            let x: f64 = s.parse().map_err(|_| ())?;
                            if x.is_infinite() || (x == 0.0 && x.is_sign_negative()) {
                                return Err(());
                            }
                            x
                        }
                    }))),
                    _ => Err(()),
                },
                "bigint" => match get(e, "v") {
                    Some(V::Text(s)) if bigint_ok(s) => Ok(Some(V::Int(s.parse::<i128>().ok()))),
                    _ => Err(()),
                },
                "undef" => Ok(Some(V::Absent)),
                "obj" => match get(e, "v") {
                    Some(V::Map(ents, _)) => Ok(Some(V::Map(ents.clone(), true))),
                    _ => Err(()),
                },
                _ => Err(()),
            };
        }
    }
    Ok(None)
}

fn text_node(s: &str) -> Value {
    json!({"t": "text", "v": s, "cu": "utf8"})
}

fn cmp16(a: &str, b: &str) -> std::cmp::Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

fn int_of(v: &V) -> R<i128> {
    match v {
        V::Num(x) => {
            if x.is_finite() && x.trunc() == *x && x.abs() < 1.0e30 {
                Ok(*x as i128)
            } else {
                Err(())
            }
        }
        V::Int(Some(i)) => Ok(*i),
        _ => Err(()),
    }
}

fn json_node(v: &V) -> R<Value> {
    let owned;
    let v = match resolve(v)? {
        Some(x) => {
            owned = x;
            &owned
        }
        None => v,
    };
    match v {
        V::Null => Ok(json!({"t": "none"})),
        V::Bool(b) => Ok(json!({"t": "bool", "v": b})),
        V::Num(x) => Ok(f64_node(*x)),
        V::Text(s) => Ok(text_node(s)),
        V::List(l) => {
            let mut out = Vec::new();
            for x in l {
                out.push(json_node(x)?);
            }
            Ok(json!({"t": "list", "v": out}))
        }
        V::Map(e, _) => {
            let mut es: Vec<&(String, V)> = e.iter().collect();
            es.sort_by(|a, b| cmp16(&a.0, &b.0));
            let mut out = Vec::new();
            for (k, x) in es {
                out.push(json!([text_node(k), json_node(x)?]));
            }
            Ok(json!({"t": "map", "v": out}))
        }
        _ => Err(()),
    }
}

fn enc(v: &V, t: &Ty) -> R<Value> {
    if let V::Map(e, false) = v {
        for key in ["__throw", "__threw"] {
            if let Some(V::Text(m)) = get(e, key) {
                return Ok(json!({"t": "throw", "msg": m}));
            }
        }
    }
    let owned;
    let v = match resolve(v)? {
        Some(x) => {
            owned = x;
            &owned
        }
        None => v,
    };
    match t {
        Ty::Union(alts) => {
            for a in alts {
                if let Ok(x) = enc(v, a) {
                    return Ok(x);
                }
            }
            Err(())
        }
        Ty::None => match v {
            V::Null | V::Absent => Ok(json!({"t": "none"})),
            _ => Err(()),
        },
        Ty::Bool => match v {
            V::Bool(b) => Ok(json!({"t": "bool", "v": b})),
            _ => Err(()),
        },
        Ty::Text => match v {
            V::Text(s) => Ok(text_node(s)),
            _ => Err(()),
        },
        Ty::Bytes => Err(()),
        Ty::F64 => match v {
            V::Num(x) => Ok(f64_node(*x)),
            _ => Err(()),
        },
        Ty::I64 => {
            let i = int_of(v)?;
            if i >= -(1i128 << 63) && i < (1i128 << 63) {
                Ok(json!({"t": "i64", "v": i.to_string()}))
            } else {
                Err(())
            }
        }
        Ty::U64 => {
            let i = int_of(v)?;
            if i >= 0 && i < (1i128 << 64) {
                Ok(json!({"t": "u64", "v": i.to_string()}))
            } else {
                Err(())
            }
        }
        Ty::Json => json_node(v),
        Ty::Tuple(ts) => match v {
            V::List(l) if l.len() == ts.len() => {
                let mut out = Vec::new();
                for (x, ty) in l.iter().zip(ts) {
                    out.push(enc(x, ty)?);
                }
                Ok(json!({"t": "tuple", "v": out}))
            }
            _ => Err(()),
        },
        Ty::List(ty) => match v {
            V::List(l) => {
                let mut out = Vec::new();
                for x in l {
                    out.push(enc(x, ty)?);
                }
                Ok(json!({"t": "list", "v": out}))
            }
            _ => Err(()),
        },
        Ty::Map(kt, vt) => match v {
            V::Map(e, _) => {
                let mut es: Vec<&(String, V)> = e.iter().collect();
                es.sort_by(|a, b| cmp16(&a.0, &b.0));
                let mut out = Vec::new();
                for (k, x) in es {
                    let kn = enc(&V::Text(k.clone()), kt)?;
                    let vn = enc(x, vt)?;
                    out.push(json!([kn, vn]));
                }
                Ok(json!({"t": "map", "v": out}))
            }
            _ => Err(()),
        },
        Ty::Record(fs) => match v {
            V::Map(e, _) => {
                let mut out = Vec::new();
                for (name, ty) in fs {
                    let absent = V::Absent;
                    let fv = get(e, name).unwrap_or(&absent);
                    out.push(json!([name, enc(fv, ty)?]));
                }
                Ok(json!({"t": "record", "v": out}))
            }
            _ => Err(()),
        },
    }
}

pub fn encode_value(value: &Value, ty: &str) -> Value {
    let t = match parse_type(ty) {
        Ok(t) => t,
        Err(_) => panic!("bad type"),
    };
    let v = conv(value);
    match enc(&v, &t) {
        Ok(x) => x,
        Err(_) => panic!("throw"),
    }
}

#[allow(dead_code)]
fn _unused(_: Map<String, Value>) {}
