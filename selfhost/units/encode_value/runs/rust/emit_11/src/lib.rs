use serde_json::{json, Value};

const MAX_VALUE_DEPTH: usize = 100;
const MAX_DEPTH: usize = 16;

#[derive(Clone, Debug)]
enum Ty {
    None_,
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
    Rec(Vec<(String, Ty)>),
    Union(Vec<Ty>),
}

#[derive(Clone, Debug)]
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

type R = Result<Value, ()>;

fn conv(v: &Value) -> V {
    match v {
        Value::Null => V::Null,
        Value::Bool(b) => V::Bool(*b),
        Value::Number(n) => V::Num(n.as_f64().unwrap_or(f64::NAN)),
        Value::String(s) => V::Str(s.clone()),
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
    fn peek(&mut self) -> Option<u8> {
        self.ws();
        self.s.get(self.i).copied()
    }
    fn expect(&mut self, c: u8) -> Result<(), ()> {
        if self.peek() == Some(c) {
            self.i += 1;
            Ok(())
        } else {
            Err(())
        }
    }
    fn name(&mut self) -> Result<String, ()> {
        self.ws();
        let st = self.i;
        match self.s.get(self.i) {
            Some(c) if c.is_ascii_alphabetic() || *c == b'_' => {}
            _ => return Err(()),
        }
        while self.i < self.s.len() && (self.s[self.i].is_ascii_alphanumeric() || self.s[self.i] == b'_') {
            self.i += 1;
        }
        Ok(String::from_utf8_lossy(&self.s[st..self.i]).into_owned())
    }
    fn ty(&mut self, d: usize) -> Result<Ty, ()> {
        let mut alts: Vec<Ty> = vec![self.alt(d)?];
        while self.peek() == Some(b'|') {
            self.i += 1;
            let a = self.alt(d)?;
            for e in &alts {
                if covers(e, &a) {
                    return Err(());
                }
            }
            alts.push(a);
        }
        if alts.len() == 1 {
            Ok(alts.pop().unwrap())
        } else {
            Ok(Ty::Union(alts))
        }
    }
    fn alt(&mut self, d: usize) -> Result<Ty, ()> {
        let n = self.name()?;
        match n.as_str() {
            "text" => Ok(Ty::Text),
            "bytes" => Ok(Ty::Bytes),
            "bool" => Ok(Ty::Bool),
            "none" => Ok(Ty::None_),
            "i64" => Ok(Ty::I64),
            "u64" => Ok(Ty::U64),
            "f64" => Ok(Ty::F64),
            "json" => Ok(Ty::Json),
            "tuple" | "list" | "map" | "record" => {
                if d + 1 > MAX_DEPTH {
                    return Err(());
                }
                self.expect(b'[')?;
                let r = match n.as_str() {
                    "tuple" => {
                        let mut items = vec![self.ty(d + 1)?];
                        while self.peek() == Some(b',') {
                            self.i += 1;
                            items.push(self.ty(d + 1)?);
                        }
                        Ty::Tuple(items)
                    }
                    "list" => Ty::List(Box::new(self.ty(d + 1)?)),
                    "map" => {
                        let k = self.ty(d + 1)?;
                        self.expect(b',')?;
                        let v = self.ty(d + 1)?;
                        Ty::Map(Box::new(k), Box::new(v))
                    }
                    _ => {
                        let mut fs: Vec<(String, Ty)> = Vec::new();
                        loop {
                            let nm = self.name()?;
                            if fs.iter().any(|(x, _)| *x == nm) {
                                return Err(());
                            }
                            self.expect(b':')?;
                            let t = self.ty(d + 1)?;
                            fs.push((nm, t));
                            if self.peek() == Some(b',') {
                                self.i += 1;
                            } else {
                                break;
                            }
                        }
                        Ty::Rec(fs)
                    }
                };
                self.expect(b']')?;
                Ok(r)
            }
            _ => Err(()),
        }
    }
}

fn key(t: &Ty) -> String {
    match t {
        Ty::None_ => "none".into(),
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
        Ty::Rec(fs) => {
            let mut v: Vec<String> = fs.iter().map(|(n, t)| format!("{}:{}", n, key(t))).collect();
            v.sort();
            v.dedup();
            format!("record{{{}}}", v.join(","))
        }
        Ty::Union(v) => {
            let mut k: Vec<String> = v.iter().map(key).collect();
            k.sort();
            k.dedup();
            format!("union({})", k.join("|"))
        }
    }
}

fn jr(t: &Ty) -> bool {
    match t {
        Ty::None_ | Ty::Bool | Ty::F64 | Ty::Text | Ty::Json => true,
        Ty::List(i) => jr(i),
        Ty::Tuple(v) => v.iter().all(jr),
        Ty::Map(k, v) => matches!(**k, Ty::Text) && jr(v),
        Ty::Rec(fs) => fs.iter().all(|(_, t)| jr(t)),
        Ty::Union(v) => v.iter().all(jr),
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
        (Ty::Rec(x), Ty::Rec(y)) => x
            .iter()
            .all(|(n, t)| y.iter().any(|(m, u)| m == n && covers(t, u))),
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
        return if x > 0.0 { "Infinity".into() } else { "-Infinity".into() };
    }
    if x == 0.0 {
        return if x.is_sign_negative() { "-0".into() } else { "0".into() };
    }
    let ax = x.abs();
    let sh = format!("{:e}", ax);
    let k = sh.split('e').next().unwrap().chars().filter(|c| c.is_ascii_digit()).count();
    let f = format!("{:.*e}", k - 1, ax);
    let mut it = f.split('e');
    let digits: String = it.next().unwrap().chars().filter(|c| c.is_ascii_digit()).collect();
    let e: i32 = it.next().unwrap().parse().unwrap();
    let n = e + 1;
    let ki = k as i32;
    let mut out = String::new();
    if x < 0.0 {
        out.push('-');
    }
    if ki <= n && n <= 21 {
        out.push_str(&digits);
        out.push_str(&"0".repeat((n - ki) as usize));
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
        if ki > 1 {
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

fn f64_node(x: f64) -> Value {
    json!({"t":"f64","v":render(x),"bits":bits(x)})
}
fn text_node(s: &str) -> Value {
    json!({"t":"text","v":s,"cu":"utf8"})
}
fn none_node() -> Value {
    json!({"t":"none"})
}

enum Res {
    Thrown(String),
    Same,
    New(V),
}

fn get<'a>(m: &'a [(String, V)], k: &str) -> Option<&'a V> {
    m.iter().find(|(n, _)| n == k).map(|(_, v)| v)
}

fn num_tag(s: &str) -> Result<f64, ()> {
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
    let mant_end_probe = |i: usize| i;
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
    let mend = mant_end_probe(i);
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
        if s[..mend].bytes().any(|c| (b'1'..=b'9').contains(&c)) {
            return Err(());
        }
        if x.is_sign_negative() {
            return Err(());
        }
    }
    Ok(x)
}

fn bigint(s: &str) -> Result<Option<i128>, ()> {
    let b = s.as_bytes();
    let body = if !b.is_empty() && b[0] == b'-' { &b[1..] } else { b };
    if body.is_empty() {
        return Err(());
    }
    if body == b"0" {
        if b[0] == b'-' {
            return Err(());
        }
    } else {
        if !(b'1'..=b'9').contains(&body[0]) || !body.iter().all(|c| c.is_ascii_digit()) {
            return Err(());
        }
    }
    Ok(s.parse::<i128>().ok())
}

fn resolve(v: &V, check_throw: bool) -> Result<Res, ()> {
    if let V::Map(m, false) = v {
        if check_throw && m.len() == 1 && (m[0].0 == "__throw" || m[0].0 == "__threw") {
            if let V::Str(s) = &m[0].1 {
                return Ok(Res::Thrown(s.clone()));
            }
        }
        if let Some(V::Str(tag)) = get(m, "__t") {
            return match tag.as_str() {
                "num" => match get(m, "v") {
                    Some(V::Str(s)) => Ok(Res::New(V::Num(num_tag(s)?))),
                    _ => Err(()),
                },
                "bigint" => match get(m, "v") {
                    Some(V::Str(s)) => Ok(Res::New(V::Int(bigint(s)?))),
                    _ => Err(()),
                },
                "undef" => Ok(Res::New(V::Absent)),
                "obj" => match get(m, "v") {
                    Some(V::Map(e, _)) => Ok(Res::New(V::Map(e.clone(), true))),
                    _ => Err(()),
                },
                _ => Err(()),
            };
        }
    }
    Ok(Res::Same)
}

fn utf16cmp(a: &str, b: &str) -> std::cmp::Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
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

fn canon(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => {
            let mut o = String::new();
            esc(s, &mut o);
            o
        }
        Value::Array(a) => format!("[{}]", a.iter().map(canon).collect::<Vec<_>>().join(",")),
        Value::Object(o) => {
            let t = o.get("t").and_then(|x| x.as_str()).unwrap_or("");
            let mut ents: Vec<(&String, &Value)> = o.iter().collect();
            if t == "f64" {
                ents.retain(|(k, _)| *k == "bits" || *k == "t");
            } else if t == "throw" {
                ents.retain(|(k, _)| *k == "t");
            }
            ents.sort_by(|a, b| utf16cmp(a.0, b.0));
            let mut s = String::from("{");
            for (i, (k, x)) in ents.iter().enumerate() {
                if i > 0 {
                    s.push(',');
                }
                esc(k, &mut s);
                s.push(':');
                s.push_str(&canon(x));
            }
            s.push('}');
            s
        }
    }
}

fn int_str(v: &V, signed: bool) -> Option<String> {
    match v {
        V::Num(x) => {
            let x = *x;
            if !x.is_finite() || x.trunc() != x {
                return None;
            }
            let ok = if signed {
                x >= -9223372036854775808.0 && x < 9223372036854775808.0
            } else {
                x >= 0.0 && x < 18446744073709551616.0
            };
            if ok {
                Some((x as i128).to_string())
            } else {
                None
            }
        }
        V::Int(Some(n)) => {
            let ok = if signed {
                *n >= i64::MIN as i128 && *n <= i64::MAX as i128
            } else {
                *n >= 0 && *n <= u64::MAX as i128
            };
            if ok {
                Some(n.to_string())
            } else {
                None
            }
        }
        _ => None,
    }
}

fn enc(v: &V, ty: &Ty, d: usize) -> R {
    if d > MAX_VALUE_DEPTH {
        return Err(());
    }
    match resolve(v, true)? {
        Res::Thrown(m) => Ok(json!({"t":"throw","msg":m})),
        Res::Same => enc2(v, ty, d),
        Res::New(nv) => enc2(&nv, ty, d),
    }
}

fn enc2(v: &V, ty: &Ty, d: usize) -> R {
    match ty {
        Ty::Union(alts) => {
            for a in alts {
                if let Ok(n) = enc(v, a, d) {
                    return Ok(n);
                }
            }
            Err(())
        }
        Ty::None_ => match v {
            V::Null | V::Absent => Ok(none_node()),
            _ => Err(()),
        },
        Ty::Bool => match v {
            V::Bool(b) => Ok(json!({"t":"bool","v":*b})),
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
        Ty::I64 => int_str(v, true).map(|s| json!({"t":"i64","v":s})).ok_or(()),
        Ty::U64 => int_str(v, false).map(|s| json!({"t":"u64","v":s})).ok_or(()),
        Ty::Bytes => Err(()),
        Ty::Json => encj2(v, d),
        Ty::Tuple(ts) => match v {
            V::List(items) if items.len() == ts.len() => {
                let mut out = Vec::new();
                for (x, t) in items.iter().zip(ts) {
                    out.push(enc(x, t, d + 1)?);
                }
                Ok(json!({"t":"tuple","v":out}))
            }
            _ => Err(()),
        },
        Ty::List(t) => match v {
            V::List(items) => {
                let mut out = Vec::new();
                for x in items {
                    out.push(enc(x, t, d + 1)?);
                }
                Ok(json!({"t":"list","v":out}))
            }
            _ => Err(()),
        },
        Ty::Map(kt, vt) => match v {
            V::Map(m, _) => {
                let mut ps: Vec<(String, Value)> = Vec::new();
                for (k, x) in m {
                    let kn = enc(&V::Str(k.clone()), kt, d + 1)?;
                    let vn = enc(x, vt, d + 1)?;
                    let sk = if kn.get("t").and_then(|t| t.as_str()) == Some("text") {
                        kn.get("v").and_then(|s| s.as_str()).unwrap_or("").to_string()
                    } else {
                        canon(&kn)
                    };
                    ps.push((sk, json!([kn, vn])));
                }
                ps.sort_by(|a, b| utf16cmp(&a.0, &b.0));
                let out: Vec<Value> = ps.into_iter().map(|(_, p)| p).collect();
                Ok(json!({"t":"map","v":out}))
            }
            _ => Err(()),
        },
        Ty::Rec(fs) => match v {
            V::Map(m, _) => {
                let mut out = Vec::new();
                for (n, t) in fs {
                    let absent = V::Absent;
                    let fv = get(m, n).unwrap_or(&absent);
                    out.push(json!([n, enc(fv, t, d + 1)?]));
                }
                Ok(json!({"t":"record","v":out}))
            }
            _ => Err(()),
        },
    }
}

fn encj(v: &V, d: usize) -> R {
    if d > MAX_VALUE_DEPTH {
        return Err(());
    }
    match resolve(v, false)? {
        Res::New(nv) => encj2(&nv, d),
        _ => encj2(v, d),
    }
}

fn encj2(v: &V, d: usize) -> R {
    if d > MAX_VALUE_DEPTH {
        return Err(());
    }
    match v {
        V::Null => Ok(none_node()),
        V::Bool(b) => Ok(json!({"t":"bool","v":*b})),
        V::Num(x) => Ok(f64_node(*x)),
        V::Str(s) => Ok(text_node(s)),
        V::List(items) => {
            let mut out = Vec::new();
            for x in items {
                out.push(encj(x, d + 1)?);
            }
            Ok(json!({"t":"list","v":out}))
        }
        V::Map(m, _) => {
            let mut ps: Vec<(&String, Value)> = Vec::new();
            for (k, x) in m {
                ps.push((k, encj(x, d + 1)?));
            }
            ps.sort_by(|a, b| utf16cmp(a.0, b.0));
            let out: Vec<Value> = ps.into_iter().map(|(k, x)| json!([text_node(k), x])).collect();
            Ok(json!({"t":"map","v":out}))
        }
        _ => Err(()),
    }
}

pub fn encode_value(value: &serde_json::Value, ty: &str) -> serde_json::Value {
    let mut p = P { s: ty.as_bytes(), i: 0 };
    let t = match p.ty(0) {
        Ok(t) => t,
        Err(_) => panic!("bad type"),
    };
    p.ws();
    if p.i != p.s.len() {
        panic!("trailing type text");
    }
    let v = conv(value);
    match enc(&v, &t, 0) {
        Ok(n) => n,
        Err(_) => panic!("encode failure"),
    }
}
