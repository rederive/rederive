use serde_json::{json, Value};

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
        Value::Number(n) => V::Num(n.as_f64().unwrap_or(0.0)),
        Value::String(s) => V::Str(s.clone()),
        Value::Array(a) => V::List(a.iter().map(from_json).collect()),
        Value::Object(m) => V::Map(m.iter().map(|(k, x)| (k.clone(), from_json(x))).collect(), false),
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
    fn peek(&mut self) -> Option<u8> {
        self.ws();
        self.b.get(self.i).copied()
    }
    fn eat(&mut self, c: u8) -> R<()> {
        if self.peek() == Some(c) {
            self.i += 1;
            Ok(())
        } else {
            Err(())
        }
    }
    fn name(&mut self) -> R<String> {
        self.ws();
        let s = self.i;
        match self.b.get(s) {
            Some(c) if c.is_ascii_alphabetic() || *c == b'_' => {}
            _ => return Err(()),
        }
        self.i += 1;
        while self.i < self.b.len() && (self.b[self.i].is_ascii_alphanumeric() || self.b[self.i] == b'_') {
            self.i += 1;
        }
        Ok(String::from_utf8_lossy(&self.b[s..self.i]).into_owned())
    }
    fn ty(&mut self, d: usize) -> R<T> {
        let mut alts = vec![self.alt(d)?];
        while self.peek() == Some(b'|') {
            self.i += 1;
            alts.push(self.alt(d)?);
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
        Ok(T::Union(alts))
    }
    fn alt(&mut self, d: usize) -> R<T> {
        let w = self.name()?;
        let t = match w.as_str() {
            "text" => T::Text,
            "bytes" => T::Bytes,
            "bool" => T::Bool,
            "none" => T::None,
            "i64" => T::I64,
            "u64" => T::U64,
            "f64" => T::F64,
            "json" => T::Json,
            "tuple" | "list" | "map" | "record" => {
                if d >= MAX_DEPTH {
                    return Err(());
                }
                self.eat(b'[')?;
                match w.as_str() {
                    "tuple" => {
                        let mut v = vec![self.ty(d + 1)?];
                        while self.peek() == Some(b',') {
                            self.i += 1;
                            v.push(self.ty(d + 1)?);
                        }
                        self.eat(b']')?;
                        T::Tuple(v)
                    }
                    "list" => {
                        let i = self.ty(d + 1)?;
                        self.eat(b']')?;
                        T::List(Box::new(i))
                    }
                    "map" => {
                        let k = self.ty(d + 1)?;
                        self.eat(b',')?;
                        let v = self.ty(d + 1)?;
                        self.eat(b']')?;
                        T::Map(Box::new(k), Box::new(v))
                    }
                    _ => {
                        let mut f: Vec<(String, T)> = Vec::new();
                        loop {
                            let n = self.name()?;
                            if f.iter().any(|(m, _)| *m == n) {
                                return Err(());
                            }
                            self.eat(b':')?;
                            let t = self.ty(d + 1)?;
                            f.push((n, t));
                            if self.peek() == Some(b',') {
                                self.i += 1;
                            } else {
                                break;
                            }
                        }
                        self.eat(b']')?;
                        T::Record(f)
                    }
                }
            }
            _ => return Err(()),
        };
        Ok(t)
    }
}

fn key(t: &T) -> String {
    match t {
        T::Text => "text".into(),
        T::Bytes => "bytes".into(),
        T::Bool => "bool".into(),
        T::None => "none".into(),
        T::I64 => "i64".into(),
        T::U64 => "u64".into(),
        T::F64 => "f64".into(),
        T::Json => "json".into(),
        T::Tuple(v) => format!("tuple[{}]", v.iter().map(key).collect::<Vec<_>>().join(",")),
        T::List(i) => format!("list[{}]", key(i)),
        T::Map(k, v) => format!("map[{},{}]", key(k), key(v)),
        T::Record(f) => {
            let mut s: Vec<String> = f.iter().map(|(n, t)| format!("{}:{}", n, key(t))).collect();
            s.sort();
            format!("record[{}]", s.join(","))
        }
        T::Union(a) => {
            let mut s: Vec<String> = a.iter().map(key).collect();
            s.sort();
            s.dedup();
            format!("union[{}]", s.join("|"))
        }
    }
}

fn reached(t: &T) -> bool {
    match t {
        T::None | T::Bool | T::F64 | T::Text | T::Json => true,
        T::List(i) => reached(i),
        T::Tuple(v) => v.iter().all(reached),
        T::Map(k, v) => matches!(**k, T::Text) && reached(v),
        T::Record(f) => f.iter().all(|(_, t)| reached(t)),
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
        (T::Tuple(x), T::Tuple(y)) => x.len() == y.len() && x.iter().zip(y.iter()).all(|(p, q)| covers(p, q)),
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

fn get<'a>(e: &'a [(String, V)], n: &str) -> Option<&'a V> {
    e.iter().find(|(k, _)| k == n).map(|(_, v)| v)
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
    let neg = b.first() == Some(&b'-');
    if neg {
        i += 1;
    }
    match b.get(i) {
        Some(b'0') => i += 1,
        Some(c) if (b'1'..=b'9').contains(c) => {
            while i < b.len() && b[i].is_ascii_digit() {
                i += 1;
            }
        }
        _ => return Err(()),
    }
    if b.get(i) == Some(&b'.') {
        i += 1;
        let s0 = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == s0 {
            return Err(());
        }
    }
    let mant_end = i;
    if matches!(b.get(i), Some(b'e') | Some(b'E')) {
        i += 1;
        if matches!(b.get(i), Some(b'+') | Some(b'-')) {
            i += 1;
        }
        let s0 = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == s0 {
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
        if s[..mant_end].bytes().any(|c| (b'1'..=b'9').contains(&c)) {
            return Err(());
        }
        if neg {
            return Err(());
        }
    }
    Ok(x)
}

fn parse_big(s: &str) -> R<Option<i128>> {
    let b = s.as_bytes();
    let d = if b.first() == Some(&b'-') { &b[1..] } else { b };
    let ok = if d == b"0" && b.len() == 1 {
        true
    } else {
        !d.is_empty() && (b'1'..=b'9').contains(&d[0]) && d.iter().all(|c| c.is_ascii_digit())
    };
    if !ok {
        return Err(());
    }
    Ok(s.parse::<i128>().ok())
}

fn resolve(v: &V) -> R<Option<V>> {
    let V::Map(e, false) = v else { return Ok(None) };
    let tag = match get(e, "__t") {
        Some(V::Str(s)) => s.as_str(),
        _ => return Ok(None),
    };
    match tag {
        "num" => match get(e, "v") {
            Some(V::Str(s)) => Ok(Some(V::Num(parse_num(s)?))),
            _ => Err(()),
        },
        "bigint" => match get(e, "v") {
            Some(V::Str(s)) => Ok(Some(V::Int(parse_big(s)?))),
            _ => Err(()),
        },
        "undef" => Ok(Some(V::Absent)),
        "obj" => match get(e, "v") {
            Some(V::Map(x, _)) => Ok(Some(V::Map(
                x.iter().map(|(k, y)| (k.clone(), clone_v(y))).collect(),
                true,
            ))),
            _ => Err(()),
        },
        _ => Err(()),
    }
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
        V::Map(e, f) => V::Map(e.iter().map(|(k, x)| (k.clone(), clone_v(x))).collect(), *f),
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
    let sh = format!("{:e}", ax);
    let k = sh.split('e').next().unwrap().chars().filter(|c| c.is_ascii_digit()).count();
    let ex = format!("{:.*e}", k - 1, ax);
    let mut it = ex.split('e');
    let m = it.next().unwrap();
    let e: i32 = it.next().unwrap().parse().unwrap();
    let digits: String = m.chars().filter(|c| c.is_ascii_digit()).collect();
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

fn throw_msg(v: &V) -> Option<&str> {
    if let V::Map(e, false) = v {
        if e.len() == 1 && (e[0].0 == "__throw" || e[0].0 == "__threw") {
            if let V::Str(s) = &e[0].1 {
                return Some(s.as_str());
            }
        }
    }
    None
}

fn sort_pairs(p: &mut Vec<(String, Value)>) {
    p.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
}

fn jbody(v: &V, d: usize) -> R<Value> {
    match v {
        V::Null => Ok(json!({"t":"none"})),
        V::Bool(b) => Ok(json!({"t":"bool","v":b})),
        V::Num(x) => Ok(f64_node(*x)),
        V::Str(s) => Ok(text_node(s)),
        V::List(l) => {
            let mut o = Vec::new();
            for x in l {
                o.push(jenc(x, d + 1)?);
            }
            Ok(json!({"t":"list","v":o}))
        }
        V::Map(e, _) => {
            let mut p = Vec::new();
            for (k, x) in e {
                p.push((k.clone(), jenc(x, d + 1)?));
            }
            sort_pairs(&mut p);
            let o: Vec<Value> = p.into_iter().map(|(k, n)| json!([text_node(&k), n])).collect();
            Ok(json!({"t":"map","v":o}))
        }
        _ => Err(()),
    }
}

fn jenc(v: &V, d: usize) -> R<Value> {
    if d > MAX_VALUE_DEPTH {
        return Err(());
    }
    let r = resolve(v)?;
    jbody(r.as_ref().unwrap_or(v), d)
}

fn int_node(t: &str, v: &V) -> R<Value> {
    let u = t == "u64";
    let i: i128 = match v {
        V::Num(x) => {
            let x = *x;
            if !x.is_finite() || x.trunc() != x {
                return Err(());
            }
            if u {
                if !(x >= 0.0 && x < 18446744073709551616.0) {
                    return Err(());
                }
            } else if !(x >= -9223372036854775808.0 && x < 9223372036854775808.0) {
                return Err(());
            }
            x as i128
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
    Ok(json!({"t":t,"v":i.to_string()}))
}

fn body(v: &V, t: &T, d: usize) -> R<Value> {
    match t {
        T::Union(alts) => {
            for a in alts {
                if let Ok(x) = body(v, a, d) {
                    return Ok(x);
                }
            }
            Err(())
        }
        T::Json => jbody(v, d),
        T::None => match v {
            V::Null | V::Absent => Ok(json!({"t":"none"})),
            _ => Err(()),
        },
        T::Bool => match v {
            V::Bool(b) => Ok(json!({"t":"bool","v":b})),
            _ => Err(()),
        },
        T::Text => match v {
            V::Str(s) => Ok(text_node(s)),
            _ => Err(()),
        },
        T::F64 => match v {
            V::Num(x) => Ok(f64_node(*x)),
            _ => Err(()),
        },
        T::I64 => int_node("i64", v),
        T::U64 => int_node("u64", v),
        T::Bytes => Err(()),
        T::Tuple(ts) => match v {
            V::List(l) if l.len() == ts.len() => {
                let mut o = Vec::new();
                for (x, ty) in l.iter().zip(ts.iter()) {
                    o.push(enc(x, ty, d + 1)?);
                }
                Ok(json!({"t":"tuple","v":o}))
            }
            _ => Err(()),
        },
        T::List(ty) => match v {
            V::List(l) => {
                let mut o = Vec::new();
                for x in l {
                    o.push(enc(x, ty, d + 1)?);
                }
                Ok(json!({"t":"list","v":o}))
            }
            _ => Err(()),
        },
        T::Map(kt, vt) => match v {
            V::Map(e, _) => {
                let mut p: Vec<(String, Value)> = Vec::new();
                for (k, x) in e {
                    let kn = enc(&V::Str(k.clone()), kt, d + 1)?;
                    let vn = enc(x, vt, d + 1)?;
                    p.push((k.clone(), json!([kn, vn])));
                }
                sort_pairs(&mut p);
                let o: Vec<Value> = p.into_iter().map(|(_, n)| n).collect();
                Ok(json!({"t":"map","v":o}))
            }
            _ => Err(()),
        },
        T::Record(fs) => match v {
            V::Map(e, _) => {
                let absent = V::Absent;
                let mut o = Vec::new();
                for (n, ft) in fs {
                    let x = get(e, n).unwrap_or(&absent);
                    o.push(json!([n, enc(x, ft, d + 1)?]));
                }
                Ok(json!({"t":"record","v":o}))
            }
            _ => Err(()),
        },
    }
}

fn enc(v: &V, t: &T, d: usize) -> R<Value> {
    if d > MAX_VALUE_DEPTH {
        return Err(());
    }
    if let Some(m) = throw_msg(v) {
        return Ok(json!({"t":"throw","msg":m}));
    }
    let r = resolve(v)?;
    body(r.as_ref().unwrap_or(v), t, d)
}

pub fn encode_value(value: &serde_json::Value, ty: &str) -> serde_json::Value {
    let mut p = P { b: ty.as_bytes(), i: 0 };
    let t = match p.ty(0) {
        Ok(t) => t,
        Err(_) => panic!("bad type"),
    };
    if p.peek().is_some() {
        panic!("bad type");
    }
    let v = from_json(value);
    match enc(&v, &t, 0) {
        Ok(x) => x,
        Err(_) => panic!("encode throw"),
    }
}
