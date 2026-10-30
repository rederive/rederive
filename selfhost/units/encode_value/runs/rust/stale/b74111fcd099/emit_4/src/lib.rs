use serde_json::{json, Map, Value};

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

#[derive(Clone, PartialEq)]
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

type R<T> = Result<T, ()>;

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
    fn name(&mut self) -> R<String> {
        self.ws();
        let s = self.i;
        if self.i < self.b.len() && (self.b[self.i].is_ascii_alphabetic() || self.b[self.i] == b'_') {
            self.i += 1;
            while self.i < self.b.len() && (self.b[self.i].is_ascii_alphanumeric() || self.b[self.i] == b'_') {
                self.i += 1;
            }
            Ok(String::from_utf8_lossy(&self.b[s..self.i]).into_owned())
        } else {
            Err(())
        }
    }
    fn eat(&mut self, c: u8) -> R<()> {
        self.ws();
        if self.i < self.b.len() && self.b[self.i] == c {
            self.i += 1;
            Ok(())
        } else {
            Err(())
        }
    }
    fn peek(&mut self, c: u8) -> bool {
        self.ws();
        self.i < self.b.len() && self.b[self.i] == c
    }
    fn ty(&mut self, depth: usize) -> R<Ty> {
        let mut alts: Vec<Ty> = Vec::new();
        loop {
            let a = self.alt(depth)?;
            if alts.contains(&a) {
                return Err(());
            }
            alts.push(a);
            if self.peek(b'|') {
                self.i += 1;
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
    fn alt(&mut self, depth: usize) -> R<Ty> {
        let n = self.name()?;
        match n.as_str() {
            "text" => Ok(Ty::Text),
            "bytes" => Ok(Ty::Bytes),
            "bool" => Ok(Ty::Bool),
            "none" => Ok(Ty::None),
            "i64" => Ok(Ty::I64),
            "u64" => Ok(Ty::U64),
            "f64" => Ok(Ty::F64),
            "json" => Ok(Ty::Json),
            "tuple" | "list" | "map" | "record" => {
                let d = depth + 1;
                if d > 256 {
                    return Err(());
                }
                self.eat(b'[')?;
                let r = match n.as_str() {
                    "tuple" => {
                        let mut items = vec![self.ty(d)?];
                        while self.peek(b',') {
                            self.i += 1;
                            items.push(self.ty(d)?);
                        }
                        Ty::Tuple(items)
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
                            let fname = self.name()?;
                            self.eat(b':')?;
                            let t = self.ty(d)?;
                            if fs.iter().any(|(x, _)| *x == fname) {
                                return Err(());
                            }
                            fs.push((fname, t));
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
                Ok(r)
            }
            _ => Err(()),
        }
    }
}

fn parse_type(s: &str) -> R<Ty> {
    let mut p = P { b: s.as_bytes(), i: 0 };
    let t = p.ty(0)?;
    p.ws();
    if p.i != p.b.len() {
        return Err(());
    }
    Ok(t)
}

fn get<'a>(m: &'a [(String, V)], k: &str) -> Option<&'a V> {
    m.iter().find(|(x, _)| x == k).map(|(_, v)| v)
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

fn big_canon(s: &str) -> bool {
    let b = s.as_bytes();
    if b == b"0" {
        return true;
    }
    let r = if !b.is_empty() && b[0] == b'-' { &b[1..] } else { b };
    !r.is_empty() && (b'1'..=b'9').contains(&r[0]) && r.iter().all(|c| c.is_ascii_digit())
}

fn is_tag(v: &V) -> bool {
    if let V::Map(m, false) = v {
        matches!(get(m, "__t"), Some(V::Str(_)))
    } else {
        false
    }
}

fn resolve(m: &[(String, V)]) -> R<V> {
    let tag = match get(m, "__t") {
        Some(V::Str(s)) => s.as_str(),
        _ => return Err(()),
    };
    match tag {
        "num" => {
            let s = match get(m, "v") {
                Some(V::Str(s)) => s.as_str(),
                _ => return Err(()),
            };
            match s {
                "NaN" => return Ok(V::Num(f64::NAN)),
                "Infinity" => return Ok(V::Num(f64::INFINITY)),
                "-Infinity" => return Ok(V::Num(f64::NEG_INFINITY)),
                "-0" => return Ok(V::Num(-0.0)),
                _ => {}
            }
            if !num_literal(s) {
                return Err(());
            }
            let x: f64 = s.parse().map_err(|_| ())?;
            if x.is_infinite() || (x == 0.0 && x.is_sign_negative()) {
                return Err(());
            }
            Ok(V::Num(x))
        }
        "bigint" => {
            let s = match get(m, "v") {
                Some(V::Str(s)) => s.as_str(),
                _ => return Err(()),
            };
            if !big_canon(s) {
                return Err(());
            }
            Ok(V::Int(s.parse::<i128>().ok()))
        }
        "undef" => Ok(V::Absent),
        "obj" => match get(m, "v") {
            Some(V::Map(es, _)) => Ok(V::Map(es.clone(), true)),
            _ => Err(()),
        },
        _ => Err(()),
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
    let a = x.abs();
    let s1 = format!("{:e}", a);
    let k = s1.split('e').next().unwrap().chars().filter(|c| c.is_ascii_digit()).count();
    let s2 = format!("{:.*e}", k - 1, a);
    let mut it = s2.split('e');
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
        for _ in 0..(n - ki) {
            out.push('0');
        }
    } else if 0 < n && n <= 21 {
        out.push_str(&digits[..n as usize]);
        out.push('.');
        out.push_str(&digits[n as usize..]);
    } else if -6 < n && n <= 0 {
        out.push_str("0.");
        for _ in 0..(-n) {
            out.push('0');
        }
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

fn esc(s: &str) -> String {
    let mut o = String::new();
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\u{8}' => o.push_str("\\b"),
            '\t' => o.push_str("\\t"),
            '\n' => o.push_str("\\n"),
            '\u{c}' => o.push_str("\\f"),
            '\r' => o.push_str("\\r"),
            c if (c as u32) < 32 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o
}

fn canon(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => format!("\"{}\"", esc(s)),
        Value::Array(a) => format!("[{}]", a.iter().map(canon).collect::<Vec<_>>().join(",")),
        Value::Object(o) => {
            let t = o.get("t").and_then(|x| x.as_str());
            let mut es: Vec<(&String, &Value)> = o.iter().collect();
            if t == Some("f64") {
                es.retain(|(k, _)| *k == "bits" || *k == "t");
            } else if t == Some("throw") {
                es.retain(|(k, _)| *k == "t");
            }
            es.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
            let parts: Vec<String> = es.iter().map(|(k, x)| format!("\"{}\":{}", esc(k), canon(x))).collect();
            format!("{{{}}}", parts.join(","))
        }
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

fn text_node(s: &str) -> Value {
    json!({"t":"text","v":s,"cu":"utf8"})
}

fn f64_node(x: f64) -> Value {
    json!({"t":"f64","v":render(x),"bits":bits(x)})
}

fn jenc(v: &V) -> R<Value> {
    let r;
    let v = if is_tag(v) {
        if let V::Map(m, _) = v {
            r = resolve(m)?;
            &r
        } else {
            v
        }
    } else {
        v
    };
    match v {
        V::Null => Ok(json!({"t":"none"})),
        V::Bool(b) => Ok(json!({"t":"bool","v":b})),
        V::Num(x) => Ok(f64_node(*x)),
        V::Str(s) => Ok(text_node(s)),
        V::List(l) => {
            let mut o = Vec::new();
            for x in l {
                o.push(jenc(x)?);
            }
            Ok(json!({"t":"list","v":o}))
        }
        V::Map(m, _) => {
            let mut ps = Vec::new();
            for (k, x) in m {
                ps.push((k.clone(), json!([text_node(k), jenc(x)?])));
            }
            ps.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
            let ps: Vec<Value> = ps.into_iter().map(|p| p.1).collect();
            Ok(json!({"t":"map","v":ps}))
        }
        _ => Err(()),
    }
}

fn int_node(t: &str, i: i128) -> Value {
    json!({"t":t,"v":i.to_string()})
}

fn intenc(v: &V, signed: bool) -> R<Value> {
    let (lo, hi): (i128, i128) = if signed {
        (-(1i128 << 63), (1i128 << 63) - 1)
    } else {
        (0, (1i128 << 64) - 1)
    };
    let t = if signed { "i64" } else { "u64" };
    match v {
        V::Num(x) => {
            if x.is_finite() && x.trunc() == *x && *x >= lo as f64 && *x < (hi as f64 + 1.0) {
                let i = *x as i128;
                if i >= lo && i <= hi {
                    return Ok(int_node(t, i));
                }
            }
            Err(())
        }
        V::Int(Some(i)) if *i >= lo && *i <= hi => Ok(int_node(t, *i)),
        _ => Err(()),
    }
}

fn enc(v: &V, ty: &Ty) -> R<Value> {
    if let V::Map(m, false) = v {
        if let Some(V::Str(s)) = get(m, "__throw") {
            return Ok(json!({"t":"throw","msg":s}));
        }
        if let Some(V::Str(s)) = get(m, "__threw") {
            return Ok(json!({"t":"throw","msg":s}));
        }
    }
    let r;
    let v = if is_tag(v) {
        if let V::Map(m, _) = v {
            r = resolve(m)?;
            &r
        } else {
            v
        }
    } else {
        v
    };
    match ty {
        Ty::None => match v {
            V::Null | V::Absent => Ok(json!({"t":"none"})),
            _ => Err(()),
        },
        Ty::Bool => match v {
            V::Bool(b) => Ok(json!({"t":"bool","v":b})),
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
        Ty::I64 => intenc(v, true),
        Ty::U64 => intenc(v, false),
        Ty::Bytes => Err(()),
        Ty::Json => {
            if let V::Absent = v {
                return Err(());
            }
            jenc(v)
        }
        Ty::Tuple(ts) => match v {
            V::List(l) if l.len() == ts.len() => {
                let mut o = Vec::new();
                for (x, t) in l.iter().zip(ts) {
                    o.push(enc(x, t)?);
                }
                Ok(json!({"t":"tuple","v":o}))
            }
            _ => Err(()),
        },
        Ty::List(t) => match v {
            V::List(l) => {
                let mut o = Vec::new();
                for x in l {
                    o.push(enc(x, t)?);
                }
                Ok(json!({"t":"list","v":o}))
            }
            _ => Err(()),
        },
        Ty::Map(kt, vt) => match v {
            V::Map(m, _) => {
                let mut ps: Vec<(String, Value)> = Vec::new();
                for (k, x) in m {
                    let kn = enc(&V::Str(k.clone()), kt)?;
                    let vn = enc(x, vt)?;
                    ps.push((sort_key(&kn), json!([kn, vn])));
                }
                ps.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
                let ps: Vec<Value> = ps.into_iter().map(|p| p.1).collect();
                Ok(json!({"t":"map","v":ps}))
            }
            _ => Err(()),
        },
        Ty::Record(fs) => match v {
            V::Map(m, _) => {
                let mut o = Vec::new();
                for (name, t) in fs {
                    let absent = V::Absent;
                    let fv = get(m, name).unwrap_or(&absent);
                    o.push(json!([name, enc(fv, t)?]));
                }
                Ok(json!({"t":"record","v":o}))
            }
            _ => Err(()),
        },
        Ty::Union(alts) => {
            for a in alts {
                if let Ok(x) = enc(v, a) {
                    return Ok(x);
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
    let v = conv(value);
    match enc(&v, &t) {
        Ok(x) => x,
        Err(_) => panic!("encode throw"),
    }
}

#[allow(dead_code)]
fn _unused(_: Map<String, Value>) {}
