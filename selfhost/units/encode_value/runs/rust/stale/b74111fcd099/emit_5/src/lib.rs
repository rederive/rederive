use serde_json::{json, Map, Value};

type R<T> = Result<T, ()>;

#[derive(Clone)]
enum V {
    Absent,
    Null,
    Bool(bool),
    Num(f64),
    Int(i128),
    Big,
    Text(String),
    List(Vec<V>),
    Map(Vec<(String, V)>, bool),
}

#[derive(PartialEq, Clone)]
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

fn to_v(j: &Value) -> V {
    match j {
        Value::Null => V::Null,
        Value::Bool(b) => V::Bool(*b),
        Value::Number(n) => V::Num(n.as_f64().unwrap_or(f64::NAN)),
        Value::String(s) => V::Text(s.clone()),
        Value::Array(a) => V::List(a.iter().map(to_v).collect()),
        Value::Object(o) => V::Map(o.iter().map(|(k, x)| (k.clone(), to_v(x))).collect(), false),
    }
}

struct P {
    s: Vec<char>,
    i: usize,
}

impl P {
    fn ws(&mut self) {
        while self.i < self.s.len() && matches!(self.s[self.i], ' ' | '\t' | '\r' | '\n') {
            self.i += 1;
        }
    }
    fn peek(&self) -> Option<char> {
        self.s.get(self.i).copied()
    }
    fn expect(&mut self, c: char) -> R<()> {
        self.ws();
        if self.peek() == Some(c) {
            self.i += 1;
            Ok(())
        } else {
            Err(())
        }
    }
    fn name(&mut self) -> R<String> {
        self.ws();
        let mut out = String::new();
        match self.peek() {
            Some(c) if c.is_ascii_alphabetic() || c == '_' => {}
            _ => return Err(()),
        }
        while let Some(c) = self.peek() {
            if c.is_ascii_alphanumeric() || c == '_' {
                out.push(c);
                self.i += 1;
            } else {
                break;
            }
        }
        Ok(out)
    }
    fn ty(&mut self, depth: usize) -> R<Ty> {
        let mut alts: Vec<Ty> = vec![];
        loop {
            let a = self.alt(depth)?;
            alts.push(a);
            self.ws();
            if self.peek() == Some('|') {
                self.i += 1;
                continue;
            }
            break;
        }
        for i in 0..alts.len() {
            for j in i + 1..alts.len() {
                if alts[i] == alts[j] {
                    return Err(());
                }
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
                self.expect('[')?;
                let d = depth + 1;
                if d > 256 {
                    return Err(());
                }
                match n.as_str() {
                    "tuple" => {
                        let mut items = vec![];
                        loop {
                            items.push(self.ty(d)?);
                            self.ws();
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
                        let t = self.ty(d)?;
                        self.expect(']')?;
                        Ok(Ty::List(Box::new(t)))
                    }
                    "map" => {
                        let k = self.ty(d)?;
                        self.expect(',')?;
                        let v = self.ty(d)?;
                        self.expect(']')?;
                        Ok(Ty::Map(Box::new(k), Box::new(v)))
                    }
                    _ => {
                        let mut fields: Vec<(String, Ty)> = vec![];
                        loop {
                            let fname = self.name()?;
                            if fields.iter().any(|(k, _)| *k == fname) {
                                return Err(());
                            }
                            self.expect(':')?;
                            let t = self.ty(d)?;
                            fields.push((fname, t));
                            self.ws();
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

fn parse_type(s: &str) -> R<Ty> {
    let mut p = P { s: s.chars().collect(), i: 0 };
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
    let mut parts = full.split('e');
    let digits: String = parts.next().unwrap().chars().filter(|c| c.is_ascii_digit()).collect();
    let e: i32 = parts.next().unwrap().parse().unwrap();
    let n = e + 1;
    let k = digits.len() as i32;
    let mut out = String::new();
    if x < 0.0 {
        out.push('-');
    }
    if k <= n && n <= 21 {
        out.push_str(&digits);
        for _ in 0..(n - k) {
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

fn f64_node(x: f64) -> Value {
    json!({"t": "f64", "v": render(x), "bits": bits(x)})
}

fn text_node(s: &str) -> Value {
    json!({"t": "text", "v": s, "cu": "utf8"})
}

fn is_num_literal(s: &str) -> bool {
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

fn is_bigint_literal(s: &str) -> bool {
    let t = s.strip_prefix('-').unwrap_or(s);
    if t == "0" {
        return t.len() == s.len();
    }
    let b = t.as_bytes();
    !b.is_empty() && (b'1'..=b'9').contains(&b[0]) && b.iter().all(|c| c.is_ascii_digit())
}

fn get_text<'a>(m: &'a [(String, V)], k: &str) -> Option<&'a V> {
    m.iter().find(|(n, _)| n == k).map(|(_, v)| v)
}

fn resolve(v: &V) -> R<Option<V>> {
    if let V::Map(m, false) = v {
        if let Some(V::Text(tag)) = get_text(m, "__t") {
            let payload = get_text(m, "v");
            return match tag.as_str() {
                "num" => {
                    let s = match payload {
                        Some(V::Text(s)) => s,
                        _ => return Err(()),
                    };
                    match s.as_str() {
                        "NaN" => Ok(Some(V::Num(f64::NAN))),
                        "Infinity" => Ok(Some(V::Num(f64::INFINITY))),
                        "-Infinity" => Ok(Some(V::Num(f64::NEG_INFINITY))),
                        "-0" => Ok(Some(V::Num(-0.0))),
                        _ => {
                            if !is_num_literal(s) {
                                return Err(());
                            }
                            let x: f64 = s.parse().map_err(|_| ())?;
                            if x.is_infinite() || (x == 0.0 && x.is_sign_negative()) {
                                return Err(());
                            }
                            Ok(Some(V::Num(x)))
                        }
                    }
                }
                "bigint" => match payload {
                    Some(V::Text(s)) if is_bigint_literal(s) => Ok(Some(match s.parse::<i128>() {
                        Ok(i) => V::Int(i),
                        Err(_) => V::Big,
                    })),
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

fn throw_obs(v: &V) -> Option<Value> {
    if let V::Map(m, false) = v {
        if let Some(V::Text(s)) = get_text(m, "__throw") {
            return Some(json!({"t": "throw", "msg": s}));
        }
        if let Some(V::Text(s)) = get_text(m, "__threw") {
            return Some(json!({"t": "throw", "msg": s}));
        }
    }
    None
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
            c if (c as u32) < 32 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

fn canon(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => esc(s),
        Value::Array(a) => format!("[{}]", a.iter().map(canon).collect::<Vec<_>>().join(",")),
        Value::Object(o) => {
            let t = o.get("t").and_then(|x| x.as_str()).unwrap_or("");
            let mut keys: Vec<&String> = o
                .keys()
                .filter(|k| match t {
                    "f64" => *k == "bits" || *k == "t",
                    "throw" => *k == "t",
                    _ => true,
                })
                .collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            let parts: Vec<String> = keys.iter().map(|k| format!("{}:{}", esc(k), canon(&o[*k]))).collect();
            format!("{{{}}}", parts.join(","))
        }
    }
}

fn sort_pairs(mut ents: Vec<(String, Value, Value)>) -> Value {
    ents.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
    Value::Array(ents.into_iter().map(|(_, k, v)| Value::Array(vec![k, v])).collect())
}

fn json_inner(v: &V) -> R<Value> {
    let r = resolve(v)?;
    let v = r.as_ref().unwrap_or(v);
    match v {
        V::Null => Ok(json!({"t": "none"})),
        V::Bool(b) => Ok(json!({"t": "bool", "v": b})),
        V::Num(x) => Ok(f64_node(*x)),
        V::Text(s) => Ok(text_node(s)),
        V::List(l) => {
            let mut out = vec![];
            for x in l {
                out.push(json_inner(x)?);
            }
            Ok(json!({"t": "list", "v": out}))
        }
        V::Map(m, _) => {
            let mut ents = vec![];
            for (k, x) in m {
                ents.push((k.clone(), text_node(k), json_inner(x)?));
            }
            Ok(json!({"t": "map", "v": sort_pairs(ents)}))
        }
        _ => Err(()),
    }
}

fn int_node(t: &str, s: String) -> Value {
    json!({"t": t, "v": s})
}

fn int_of(v: &V, lo: f64, hi: f64, ilo: i128, ihi: i128) -> R<String> {
    match v {
        V::Num(x) => {
            if x.is_finite() && x.trunc() == *x && *x >= lo && *x < hi {
                Ok((*x as i128).to_string())
            } else {
                Err(())
            }
        }
        V::Int(i) if *i >= ilo && *i <= ihi => Ok(i.to_string()),
        _ => Err(()),
    }
}

fn enc(v: &V, t: &Ty) -> R<Value> {
    if let Some(m) = throw_obs(v) {
        return Ok(m);
    }
    let r = resolve(v)?;
    let v = r.as_ref().unwrap_or(v);
    enc_res(v, t)
}

fn enc_res(v: &V, t: &Ty) -> R<Value> {
    match t {
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
        Ty::F64 => match v {
            V::Num(x) => Ok(f64_node(*x)),
            _ => Err(()),
        },
        Ty::I64 => Ok(int_node("i64", int_of(v, -9223372036854775808.0, 9223372036854775808.0, i64::MIN as i128, i64::MAX as i128)?)),
        Ty::U64 => Ok(int_node("u64", int_of(v, 0.0, 18446744073709551616.0, 0, u64::MAX as i128)?)),
        Ty::Bytes => Err(()),
        Ty::Json => json_inner(v),
        Ty::Tuple(ts) => match v {
            V::List(l) if l.len() == ts.len() => {
                let mut out = vec![];
                for (x, ty) in l.iter().zip(ts) {
                    out.push(enc(x, ty)?);
                }
                Ok(json!({"t": "tuple", "v": out}))
            }
            _ => Err(()),
        },
        Ty::List(ty) => match v {
            V::List(l) => {
                let mut out = vec![];
                for x in l {
                    out.push(enc(x, ty)?);
                }
                Ok(json!({"t": "list", "v": out}))
            }
            _ => Err(()),
        },
        Ty::Map(kt, vt) => match v {
            V::Map(m, _) => {
                let mut ents = vec![];
                for (k, x) in m {
                    let kn = enc(&V::Text(k.clone()), kt)?;
                    let vn = enc(x, vt)?;
                    let sk = if kn["t"] == "text" {
                        kn["v"].as_str().unwrap_or("").to_string()
                    } else {
                        canon(&kn)
                    };
                    ents.push((sk, kn, vn));
                }
                Ok(json!({"t": "map", "v": sort_pairs(ents)}))
            }
            _ => Err(()),
        },
        Ty::Record(fs) => match v {
            V::Map(m, _) => {
                let mut out = vec![];
                for (name, ty) in fs {
                    let fv = get_text(m, name).cloned().unwrap_or(V::Absent);
                    out.push(Value::Array(vec![Value::String(name.clone()), enc(&fv, ty)?]));
                }
                Ok(json!({"t": "record", "v": out}))
            }
            _ => Err(()),
        },
        Ty::Union(alts) => {
            for a in alts {
                if let Ok(x) = enc_res(v, a) {
                    return Ok(x);
                }
            }
            Err(())
        }
    }
}

pub fn encode_value(value: &serde_json::Value, ty: &str) -> serde_json::Value {
    let _unused: Map<String, Value> = Map::new();
    let t = match parse_type(ty) {
        Ok(t) => t,
        Err(_) => panic!("bad type"),
    };
    match enc(&to_v(value), &t) {
        Ok(v) => v,
        Err(_) => panic!("throw"),
    }
}
