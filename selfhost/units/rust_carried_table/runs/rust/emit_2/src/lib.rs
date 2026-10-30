use serde_json::{Map, Number, Value};

type R<T> = Result<T, String>;

#[derive(Clone, Debug)]
enum Tok {
    Str(String),
    Chr(String),
    Num(f64, bool),
    Bool(bool),
    Ident(String),
    P(String),
}

#[derive(Clone, Debug)]
enum V {
    Text(String),
    Num(f64),
    Bool(bool),
    Null,
    List(Vec<V>),
}

fn is_hex(c: char) -> bool {
    c.is_ascii_hexdigit()
}

fn unescape(b: &[char]) -> R<String> {
    let mut out = String::new();
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        if c != '\\' {
            out.push(c);
            i += 1;
            continue;
        }
        let e = *b.get(i + 1).ok_or("bad escape")?;
        i += 2;
        match e {
            'n' => out.push('\n'),
            'r' => out.push('\r'),
            't' => out.push('\t'),
            '0' => out.push('\0'),
            '\\' | '\'' | '"' => out.push(e),
            'x' => {
                if i + 1 < b.len() && is_hex(b[i]) && is_hex(b[i + 1]) {
                    let v = b[i].to_digit(16).unwrap() * 16 + b[i + 1].to_digit(16).unwrap();
                    out.push(char::from_u32(v).ok_or("bad escape")?);
                    i += 2;
                } else {
                    return Err("bad \\x escape".into());
                }
            }
            'u' => {
                if b.get(i) != Some(&'{') {
                    return Err("bad \\u escape".into());
                }
                let close = b[i + 1..].iter().position(|&x| x == '}').ok_or("bad \\u escape")?;
                let hex: String = b[i + 1..i + 1 + close].iter().filter(|&&x| x != '_').collect();
                if hex.is_empty() || !hex.chars().all(is_hex) {
                    return Err("bad \\u escape".into());
                }
                let t = hex.trim_start_matches('0');
                if t.len() > 8 {
                    return Err("bad \\u escape".into());
                }
                let v = if t.is_empty() { 0 } else { u32::from_str_radix(t, 16).map_err(|_| "bad \\u escape".to_string())? };
                if v > 0x10FFFF {
                    return Err("bad \\u escape".into());
                }
                out.push(char::from_u32(v).ok_or("bad \\u escape")?);
                i = i + 1 + close + 1;
            }
            '\n' | '\r' => {
                while i < b.len() && matches!(b[i], ' ' | '\t' | '\r' | '\n') {
                    i += 1;
                }
            }
            _ => return Err("unknown escape".into()),
        }
    }
    Ok(out)
}

const SUFFIXES: [&str; 14] = [
    "u8", "u16", "u32", "u64", "u128", "usize", "i8", "i16", "i32", "i64", "i128", "isize", "f32", "f64",
];

fn match_suffix(w: &[char], q: usize) -> Option<&'static str> {
    for s in SUFFIXES.iter() {
        let sc: Vec<char> = s.chars().collect();
        if w.len() >= q + sc.len() && w[q..q + sc.len()] == sc[..] {
            return Some(s);
        }
    }
    None
}

fn pow2(t: usize) -> f64 {
    let mut r = 1.0f64;
    for _ in 0..t {
        r *= 2.0;
    }
    r
}

fn lex_number(chars: &[char], i: usize) -> (Tok, usize) {
    let end = (i + 64).min(chars.len());
    let w = &chars[i..end];
    let mut p;
    let mut radix = 0u32;
    let mut has_frac = false;
    let mut has_exp = false;
    if w.len() >= 3 && w[0] == '0' && matches!(w[1], 'x' | 'o' | 'b') {
        let r = match w[1] {
            'x' => 16,
            'o' => 8,
            _ => 2,
        };
        let mut k = 2;
        while k < w.len() && (w[k] == '_' || w[k].to_digit(r).is_some()) {
            k += 1;
        }
        if k > 2 {
            radix = r;
            p = k;
        } else {
            p = 0;
        }
    } else {
        p = 0;
    }
    if radix == 0 {
        p = 1;
        while p < w.len() && (w[p].is_ascii_digit() || w[p] == '_') {
            p += 1;
        }
        if p + 1 < w.len() && w[p] == '.' && w[p + 1].is_ascii_digit() {
            has_frac = true;
            p += 2;
            while p < w.len() && (w[p].is_ascii_digit() || w[p] == '_') {
                p += 1;
            }
        }
        if p < w.len() && (w[p] == 'e' || w[p] == 'E') {
            let mut q = p + 1;
            if q < w.len() && (w[q] == '+' || w[q] == '-') {
                q += 1;
            }
            if q < w.len() && w[q].is_ascii_digit() {
                q += 1;
                while q < w.len() && (w[q].is_ascii_digit() || w[q] == '_') {
                    q += 1;
                }
                has_exp = true;
                p = q;
            }
        }
    }
    let body_end = p;
    let mut q = p;
    if w.get(q) == Some(&'_') {
        q += 1;
    }
    let mut suffix = "";
    if let Some(s) = match_suffix(w, q) {
        suffix = s;
        p = q + s.len();
    }
    let body: Vec<char> = w[..body_end].iter().cloned().filter(|&c| c != '_').collect();
    let (mut val, mut inexact);
    if radix != 0 {
        let digits: Vec<u32> = body[2..].iter().map(|c| c.to_digit(radix).unwrap()).collect();
        if digits.is_empty() {
            val = 0.0;
            inexact = true;
        } else {
            let bw = match radix {
                16 => 4,
                8 => 3,
                _ => 1,
            };
            let mut bits: Vec<bool> = Vec::new();
            for d in digits {
                for s in (0..bw).rev() {
                    bits.push((d >> s) & 1 == 1);
                }
            }
            let first = bits.iter().position(|&b| b);
            match first {
                None => {
                    val = 0.0;
                    inexact = false;
                }
                Some(f) => {
                    let bits = &bits[f..];
                    let l = bits.len();
                    let t = bits.iter().rev().take_while(|&&b| !b).count();
                    if l - t <= 53 && l <= 1024 {
                        let mut m: u64 = 0;
                        for &b in &bits[..l - t] {
                            m = m * 2 + b as u64;
                        }
                        val = m as f64 * pow2(t);
                        inexact = false;
                    } else {
                        val = 0.0;
                        inexact = true;
                    }
                }
            }
        }
    } else if !has_frac && !has_exp {
        let mut ds: Vec<u8> = body.iter().map(|c| *c as u8 - b'0').collect();
        while ds.first() == Some(&0) {
            ds.remove(0);
        }
        if ds.is_empty() {
            val = 0.0;
            inexact = false;
        } else {
            let mut t = 0usize;
            while ds.last().map_or(false, |d| d % 2 == 0) {
                let mut carry = 0u8;
                for d in ds.iter_mut() {
                    let cur = carry * 10 + *d;
                    *d = cur / 2;
                    carry = cur % 2;
                }
                while ds.first() == Some(&0) {
                    ds.remove(0);
                }
                t += 1;
            }
            if ds.len() > 16 {
                val = 0.0;
                inexact = true;
            } else {
                let mut m: u64 = 0;
                for d in &ds {
                    m = m * 10 + *d as u64;
                }
                let bl = 64 - m.leading_zeros() as usize;
                if m < (1u64 << 53) && bl + t <= 1024 {
                    val = m as f64 * pow2(t);
                    inexact = false;
                } else {
                    val = 0.0;
                    inexact = true;
                }
            }
        }
    } else {
        let s: String = body.iter().collect();
        match s.parse::<f64>() {
            Ok(v) if v.is_finite() => {
                val = v;
                inexact = false;
            }
            _ => {
                val = 0.0;
                inexact = true;
            }
        }
    }
    if suffix == "f32" && radix != 16 {
        let f = val as f32;
        if !(f.is_finite() && f as f64 == val) {
            inexact = true;
        }
    }
    let _ = &mut val;
    (Tok::Num(val, inexact), p)
}

fn lex_char(c: &[char], i: usize) -> R<Option<(Tok, usize)>> {
    let c1 = match c.get(i + 1) {
        Some(&x) => x,
        None => return Ok(None),
    };
    if c1 != '\'' && c1 != '\\' {
        if c.get(i + 2) == Some(&'\'') {
            return Ok(Some((Tok::Chr(c1.to_string()), i + 3)));
        }
        return Ok(None);
    }
    if c1 != '\\' {
        return Ok(None);
    }
    let c2 = match c.get(i + 2) {
        Some(&x) => x,
        None => return Ok(None),
    };
    if matches!(c2, 'n' | 'r' | 't' | '0' | '\\' | '\'' | '"') {
        if c.get(i + 3) == Some(&'\'') {
            return Ok(Some((Tok::Chr(unescape(&c[i + 1..i + 3])?), i + 4)));
        }
        return Ok(None);
    }
    if c2 == 'x' {
        if i + 5 < c.len() && is_hex(c[i + 3]) && is_hex(c[i + 4]) && c[i + 5] == '\'' {
            return Ok(Some((Tok::Chr(unescape(&c[i + 1..i + 5])?), i + 6)));
        }
        return Ok(None);
    }
    if c2 == 'u' && c.get(i + 3) == Some(&'{') {
        let mut k = i + 4;
        while k < c.len() && k < i + 12 && (is_hex(c[k]) || c[k] == '_') {
            k += 1;
        }
        if k > i + 4 && c.get(k) == Some(&'}') && c.get(k + 1) == Some(&'\'') {
            return Ok(Some((Tok::Chr(unescape(&c[i + 1..k + 1])?), k + 2)));
        }
    }
    Ok(None)
}

fn lex(src: &str) -> R<Vec<Tok>> {
    let c: Vec<char> = src.chars().collect();
    let n = c.len();
    let mut t = Vec::new();
    let mut i = 0;
    while i < n {
        let ch = c[i];
        if matches!(ch, ' ' | '\t' | '\r' | '\n') {
            i += 1;
            continue;
        }
        if ch == '/' && c.get(i + 1) == Some(&'/') {
            while i < n && c[i] != '\n' {
                i += 1;
            }
            continue;
        }
        if ch == '/' && c.get(i + 1) == Some(&'*') {
            let mut depth = 1;
            i += 2;
            while i < n && depth > 0 {
                if c[i] == '/' && c.get(i + 1) == Some(&'*') {
                    depth += 1;
                    i += 2;
                } else if c[i] == '*' && c.get(i + 1) == Some(&'/') {
                    depth -= 1;
                    i += 2;
                } else {
                    i += 1;
                }
            }
            continue;
        }
        if ch == 'b' || ch == 'r' {
            let w = &c[i..(i + 32).min(n)];
            let mut k = 0;
            if w.get(k) == Some(&'b') {
                k += 1;
            }
            if w.get(k) == Some(&'r') {
                k += 1;
                let h0 = k;
                while k < w.len() && w[k] == '#' {
                    k += 1;
                }
                if w.get(k) == Some(&'"') {
                    let h = k - h0;
                    let start = i + k + 1;
                    let mut j = start;
                    let mut found = None;
                    while j < n {
                        if c[j] == '"' && (1..=h).all(|x| c.get(j + x) == Some(&'#')) {
                            found = Some(j);
                            break;
                        }
                        j += 1;
                    }
                    match found {
                        Some(j) => {
                            t.push(Tok::Str(c[start..j].iter().collect()));
                            i = j + 1 + h;
                            continue;
                        }
                        None => return Err("unterminated raw string".into()),
                    }
                }
            }
        }
        if ch == '"' || (ch == 'b' && c.get(i + 1) == Some(&'"')) {
            let start = if ch == '"' { i + 1 } else { i + 2 };
            let mut j = start;
            loop {
                if j >= n {
                    return Err("unterminated string".into());
                }
                if c[j] == '\\' {
                    j += 2;
                } else if c[j] == '"' {
                    break;
                } else {
                    j += 1;
                }
            }
            t.push(Tok::Str(unescape(&c[start..j])?));
            i = j + 1;
            continue;
        }
        if ch == '\'' {
            if let Some((tok, ni)) = lex_char(&c, i)? {
                t.push(tok);
                i = ni;
            } else {
                t.push(Tok::P("'".into()));
                i += 1;
            }
            continue;
        }
        if ch.is_ascii_digit() {
            let (tok, used) = lex_number(&c, i);
            t.push(tok);
            i += used;
            continue;
        }
        if ch.is_ascii_alphabetic() || ch == '_' {
            let mut j = i;
            while j < n && (c[j].is_ascii_alphanumeric() || c[j] == '_') {
                j += 1;
            }
            let w: String = c[i..j].iter().collect();
            t.push(match w.as_str() {
                "true" => Tok::Bool(true),
                "false" => Tok::Bool(false),
                _ => Tok::Ident(w),
            });
            i = j;
            continue;
        }
        if i + 1 < n {
            let two: String = c[i..i + 2].iter().collect();
            if matches!(two.as_str(), "=>" | "->" | "::" | "..") {
                t.push(Tok::P(two));
                i += 2;
                continue;
            }
        }
        t.push(Tok::P(ch.to_string()));
        i += 1;
    }
    Ok(t)
}

fn is_p(t: Option<&Tok>, s: &str) -> bool {
    matches!(t, Some(Tok::P(x)) if x == s)
}

fn cast(x: f64, t: &[Tok], p: usize) -> R<(V, usize)> {
    if let Some(Tok::Ident(a)) = t.get(p) {
        if a == "as" {
            let ty = match t.get(p + 1) {
                Some(Tok::Ident(n)) => n.as_str(),
                _ => return Err("bad cast".into()),
            };
            let p2 = p + 2;
            let p53 = 9007199254740992.0f64;
            let range = |lo: f64, hi: f64| -> R<(V, usize)> {
                if x.fract() == 0.0 && x >= lo && x <= hi {
                    Ok((V::Num(if x == 0.0 { 0.0 } else { x }), p2))
                } else {
                    Err("bad cast".into())
                }
            };
            return match ty {
                "f64" => Ok((V::Num(x), p2)),
                "f32" => {
                    let f = x as f32;
                    if f.is_finite() && f as f64 == x {
                        Ok((V::Num(x), p2))
                    } else {
                        Err("bad cast".into())
                    }
                }
                "u8" => range(0.0, 255.0),
                "u16" => range(0.0, 65535.0),
                "u32" => range(0.0, 4294967295.0),
                "i8" => range(-128.0, 127.0),
                "i16" => range(-32768.0, 32767.0),
                "i32" => range(-2147483648.0, 2147483647.0),
                "u64" | "usize" | "u128" => range(0.0, p53),
                "i64" | "isize" | "i128" => range(-p53, p53),
                _ => Err("bad cast".into()),
            };
        }
    }
    Ok((V::Num(x), p))
}

fn parse_value(t: &[Tok], mut p: usize) -> R<Option<(V, usize)>> {
    while is_p(t.get(p), "&") {
        p += 1;
    }
    let tok = match t.get(p) {
        Some(x) => x,
        None => return Ok(None),
    };
    match tok {
        Tok::Str(s) | Tok::Chr(s) => Ok(Some((V::Text(s.clone()), p + 1))),
        Tok::Bool(b) => Ok(Some((V::Bool(*b), p + 1))),
        Tok::Num(x, inx) => {
            if *inx {
                return Err("inexact literal".into());
            }
            Ok(Some(cast(*x, t, p + 1)?))
        }
        Tok::P(s) if s == "-" => {
            if let Some(Tok::Num(x, inx)) = t.get(p + 1) {
                if *inx {
                    return Err("inexact literal".into());
                }
                Ok(Some(cast(-*x, t, p + 2)?))
            } else {
                Ok(None)
            }
        }
        Tok::Ident(s) if s == "None" => Ok(Some((V::Null, p + 1))),
        Tok::Ident(s) if s == "Some" => {
            if is_p(t.get(p + 1), "(") {
                if let Some(Tok::Ident(n)) = t.get(p + 2) {
                    if n == "Some" || n == "None" {
                        return Err("nested option".into());
                    }
                }
                match parse_value(t, p + 2)? {
                    Some((v, q)) if is_p(t.get(q), ")") => Ok(Some((v, q + 1))),
                    _ => Ok(None),
                }
            } else {
                Ok(None)
            }
        }
        Tok::P(s) if s == "[" || s == "(" => {
            let close = if s == "[" { "]" } else { ")" };
            let mut q = p + 1;
            let mut items = Vec::new();
            let mut comma = false;
            loop {
                if is_p(t.get(q), close) {
                    q += 1;
                    break;
                }
                match parse_value(t, q)? {
                    None => return Ok(None),
                    Some((v, r)) => {
                        items.push(v);
                        q = r;
                    }
                }
                if is_p(t.get(q), ",") {
                    comma = true;
                    q += 1;
                    continue;
                }
                if is_p(t.get(q), close) {
                    q += 1;
                    break;
                }
                return Ok(None);
            }
            if s == "(" && items.len() == 1 && !comma {
                Ok(Some((items.pop().unwrap(), q)))
            } else {
                Ok(Some((V::List(items), q)))
            }
        }
        _ => Ok(None),
    }
}

fn scan(t: &[Tok]) -> R<Vec<(String, V)>> {
    let mut tuples = Vec::new();
    let mut arms = Vec::new();
    let mut i = 0;
    while i < t.len() {
        if is_p(t.get(i), "(") {
            if let (Some(Tok::Str(k)), true) = (t.get(i + 1), is_p(t.get(i + 2), ",")) {
                match parse_value(t, i + 3)? {
                    None => return Err("tuple without value".into()),
                    Some((v, q)) => {
                        if is_p(t.get(q), ")") {
                            tuples.push((k.clone(), v));
                            i = q + 1;
                        } else {
                            i += 1;
                        }
                        continue;
                    }
                }
            }
        }
        if let Tok::Str(k) = &t[i] {
            if is_p(t.get(i + 1), "|") {
                if let Some(Tok::Str(_)) = t.get(i + 2) {
                    return Err("or-pattern".into());
                }
            }
            if is_p(t.get(i + 1), "=>") {
                match parse_value(t, i + 2)? {
                    Some((v, q)) if is_p(t.get(q), ",") || is_p(t.get(q), "}") => {
                        arms.push((k.clone(), v));
                        i = q;
                        continue;
                    }
                    _ => return Err("bad arm".into()),
                }
            }
        }
        i += 1;
    }
    Ok(if tuples.is_empty() { arms } else { tuples })
}

#[derive(Clone, Debug)]
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

fn same(a: &Ty, b: &Ty) -> bool {
    match (a, b) {
        (Ty::Union(x), Ty::Union(y)) => {
            x.iter().all(|i| y.iter().any(|j| same(i, j))) && y.iter().all(|j| x.iter().any(|i| same(i, j)))
        }
        (Ty::List(x), Ty::List(y)) => same(x, y),
        (Ty::Tuple(x), Ty::Tuple(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q)),
        (Ty::Map(k1, v1), Ty::Map(k2, v2)) => same(k1, k2) && same(v1, v2),
        (Ty::Record(x), Ty::Record(y)) => {
            x.len() == y.len() && x.iter().all(|(n, t)| y.iter().any(|(m, u)| n == m && same(t, u)))
        }
        _ => {
            !matches!(a, Ty::Tuple(_) | Ty::List(_) | Ty::Map(..) | Ty::Record(_) | Ty::Union(_))
                && std::mem::discriminant(a) == std::mem::discriminant(b)
        }
    }
}

fn jsonacc(t: &Ty) -> bool {
    match t {
        Ty::NoneT | Ty::Bool | Ty::F64 | Ty::Text | Ty::Json => true,
        Ty::List(x) => jsonacc(x),
        Ty::Tuple(x) => x.iter().all(jsonacc),
        Ty::Map(k, v) => matches!(**k, Ty::Text) && jsonacc(v),
        Ty::Record(f) => f.iter().all(|(_, t)| jsonacc(t)),
        Ty::Union(x) => x.iter().all(jsonacc),
        _ => false,
    }
}

fn covers(a: &Ty, b: &Ty) -> bool {
    if same(a, b) {
        return true;
    }
    if matches!(a, Ty::Json) && jsonacc(b) {
        return true;
    }
    match (a, b) {
        (Ty::List(x), Ty::List(y)) if covers(x, y) => return true,
        (Ty::Tuple(x), Ty::Tuple(y)) if x.len() == y.len() && x.iter().zip(y).all(|(p, q)| covers(p, q)) => {
            return true
        }
        (Ty::Map(k1, v1), Ty::Map(k2, v2)) if covers(k1, k2) && covers(v1, v2) => return true,
        (Ty::Record(x), Ty::Record(y))
            if x.iter().all(|(n, t)| y.iter().any(|(m, u)| n == m && covers(t, u))) =>
        {
            return true
        }
        _ => {}
    }
    if let Ty::Union(x) = a {
        if x.iter().any(|i| covers(i, b)) {
            return true;
        }
    }
    if let Ty::Union(y) = b {
        if y.iter().all(|j| covers(a, j)) {
            return true;
        }
    }
    false
}

fn is_ws(c: char) -> bool {
    matches!(c, ' ' | '\t' | '\r' | '\n')
}

fn norm(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let mut a = 0;
    let mut b = c.len();
    while a < b && is_ws(c[a]) {
        a += 1;
    }
    while b > a && is_ws(c[b - 1]) {
        b -= 1;
    }
    let t = &c[a..b];
    let len = t.len();
    if len > 3 && t[0] == 'm' && t[1] == 'a' && t[2] == 'p' {
        let mut wsmax = 0;
        while 3 + wsmax < len && is_ws(t[3 + wsmax]) {
            wsmax += 1;
        }
        for wl in (1..=wsmax).rev() {
            let start = 3 + wl;
            for k in 1..=(len - start) {
                let mut x = start + k;
                while x < len && is_ws(t[x]) {
                    x += 1;
                }
                if x + 1 < len && t[x] == '-' && t[x + 1] == '>' {
                    let mut y = x + 2;
                    while y < len && is_ws(t[y]) {
                        y += 1;
                    }
                    if y < len {
                        let ks: String = t[start..start + k].iter().collect();
                        let vs: String = t[y..].iter().collect();
                        return format!("map[{}, {}]", norm(&ks), norm(&vs));
                    }
                }
            }
        }
    }
    t.iter().collect()
}

fn widen(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let n = c.len();
    let names = [("u8", "u64"), ("u16", "u64"), ("u32", "u64"), ("i8", "i64"), ("i16", "i64"), ("i32", "i64")];
    let mut out = String::new();
    let mut prev: Option<char> = None;
    let mut i = 0;
    'outer: while i < n {
        let ch = c[i];
        if is_ws(ch) {
            out.push(ch);
            i += 1;
            continue;
        }
        if prev.map_or(true, |p| "[,|:".contains(p)) {
            for (nm, rep) in names.iter() {
                let nc: Vec<char> = nm.chars().collect();
                if c[i..].starts_with(&nc) {
                    let j = i + nc.len();
                    let mut k = j;
                    while k < n && is_ws(c[k]) {
                        k += 1;
                    }
                    if k == n || "],|".contains(c[k]) {
                        out.push_str(rep);
                        i = j;
                        prev = Some('4');
                        continue 'outer;
                    }
                }
            }
        }
        out.push(ch);
        prev = Some(ch);
        i += 1;
    }
    out
}

struct Sp {
    t: Vec<String>,
    p: usize,
}

impl Sp {
    fn peek(&self) -> Option<&str> {
        self.t.get(self.p).map(|s| s.as_str())
    }
    fn next(&mut self) -> R<String> {
        let s = self.t.get(self.p).cloned().ok_or("shape eof")?;
        self.p += 1;
        Ok(s)
    }
    fn expect(&mut self, x: &str) -> R<()> {
        if self.next()? == x {
            Ok(())
        } else {
            Err("shape syntax".into())
        }
    }
    fn ty(&mut self, depth: usize) -> R<Ty> {
        let mut alts = vec![self.alt(depth)?];
        while self.peek() == Some("|") {
            self.p += 1;
            alts.push(self.alt(depth)?);
        }
        if alts.len() == 1 {
            return Ok(alts.pop().unwrap());
        }
        for i in 0..alts.len() {
            for j in i + 1..alts.len() {
                if covers(&alts[i], &alts[j]) {
                    return Err("covered alternative".into());
                }
            }
        }
        Ok(Ty::Union(alts))
    }
    fn alt(&mut self, depth: usize) -> R<Ty> {
        let w = self.next()?;
        let d = depth + 1;
        match w.as_str() {
            "text" => Ok(Ty::Text),
            "bytes" => Ok(Ty::Bytes),
            "bool" => Ok(Ty::Bool),
            "none" => Ok(Ty::NoneT),
            "i64" => Ok(Ty::I64),
            "u64" => Ok(Ty::U64),
            "f64" => Ok(Ty::F64),
            "json" => Ok(Ty::Json),
            "tuple" | "list" | "map" | "record" => {
                if d > 16 {
                    return Err("too deep".into());
                }
                self.expect("[")?;
                let r = match w.as_str() {
                    "tuple" => {
                        let mut v = vec![self.ty(d)?];
                        while self.peek() == Some(",") {
                            self.p += 1;
                            v.push(self.ty(d)?);
                        }
                        Ty::Tuple(v)
                    }
                    "list" => Ty::List(Box::new(self.ty(d)?)),
                    "map" => {
                        let k = self.ty(d)?;
                        self.expect(",")?;
                        let v = self.ty(d)?;
                        Ty::Map(Box::new(k), Box::new(v))
                    }
                    _ => {
                        let mut f: Vec<(String, Ty)> = Vec::new();
                        loop {
                            let name = self.next()?;
                            let mut ch = name.chars();
                            let f0 = ch.next().ok_or("name")?;
                            if !(f0.is_ascii_alphabetic() || f0 == '_') {
                                return Err("bad name".into());
                            }
                            if f.iter().any(|(n, _)| *n == name) {
                                return Err("dup name".into());
                            }
                            self.expect(":")?;
                            let t = self.ty(d)?;
                            f.push((name, t));
                            if self.peek() == Some(",") {
                                self.p += 1;
                            } else {
                                break;
                            }
                        }
                        Ty::Record(f)
                    }
                };
                self.expect("]")?;
                Ok(r)
            }
            _ => Err("unknown type".into()),
        }
    }
}

fn read_shape(shape: &str) -> R<Ty> {
    let s = shape.split(';').next().unwrap_or("");
    let s = widen(&norm(s));
    let c: Vec<char> = s.chars().collect();
    let mut toks = Vec::new();
    let mut i = 0;
    while i < c.len() {
        if is_ws(c[i]) {
            i += 1;
        } else if c[i].is_ascii_alphanumeric() || c[i] == '_' {
            let mut j = i;
            while j < c.len() && (c[j].is_ascii_alphanumeric() || c[j] == '_') {
                j += 1;
            }
            toks.push(c[i..j].iter().collect::<String>());
            i = j;
        } else if "[],:|".contains(c[i]) {
            toks.push(c[i].to_string());
            i += 1;
        } else {
            return Err("bad shape char".into());
        }
    }
    let mut sp = Sp { t: toks, p: 0 };
    let ty = sp.ty(0)?;
    if sp.p != sp.t.len() {
        return Err("trailing shape".into());
    }
    Ok(ty)
}

fn fit(v: &V, t: &Ty) -> bool {
    match t {
        Ty::Text => matches!(v, V::Text(_)),
        Ty::Bool => matches!(v, V::Bool(_)),
        Ty::NoneT => matches!(v, V::Null),
        Ty::F64 => matches!(v, V::Num(_)),
        Ty::I64 => matches!(v, V::Num(x) if x.fract() == 0.0 && *x >= -9223372036854775808.0 && *x < 9223372036854775808.0),
        Ty::U64 => matches!(v, V::Num(x) if x.fract() == 0.0 && *x >= 0.0 && *x < 18446744073709551616.0),
        Ty::Json => true,
        Ty::List(i) => matches!(v, V::List(l) if l.iter().all(|e| fit(e, i))),
        Ty::Tuple(ts) => matches!(v, V::List(l) if l.len() == ts.len() && l.iter().zip(ts).all(|(e, t)| fit(e, t))),
        Ty::Union(alts) => alts.iter().any(|a| fit(v, a)),
        _ => false,
    }
}

fn inner_eq(a: &V, b: &V) -> bool {
    match (a, b) {
        (V::List(x), V::List(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| inner_eq(p, q)),
        (V::List(_), _) | (_, V::List(_)) => false,
        (V::Num(x), V::Num(y)) => x == y,
        (V::Text(x), V::Text(y)) => x == y,
        (V::Bool(x), V::Bool(y)) => x == y,
        (V::Null, V::Null) => true,
        _ => false,
    }
}

fn same_val(a: &V, b: &V) -> bool {
    match (a, b) {
        (V::List(_), V::List(_)) => inner_eq(a, b),
        (V::List(_), _) | (_, V::List(_)) => false,
        (V::Num(x), V::Num(y)) => x.to_bits() == y.to_bits(),
        _ => inner_eq(a, b),
    }
}

fn to_json(v: &V) -> Value {
    match v {
        V::Text(s) => Value::String(s.clone()),
        V::Num(x) => Number::from_f64(*x).map(Value::Number).unwrap_or(Value::Null),
        V::Bool(b) => Value::Bool(*b),
        V::Null => Value::Null,
        V::List(l) => Value::Array(l.iter().map(to_json).collect()),
    }
}

pub fn rust_carried_table(src: &str, shape: Option<&str>) -> Result<serde_json::Value, String> {
    let toks = lex(src)?;
    let entries = scan(&toks)?;
    if entries.is_empty() {
        return Err("no carried entries found".into());
    }
    if let Some(sh) = shape {
        if !sh.is_empty() {
            let ty = read_shape(sh)?;
            if let Ty::Map(kt, vt) = ty {
                for (k, v) in &entries {
                    if !fit(&V::Text(k.clone()), &kt) || !fit(v, &vt) {
                        return Err("shape misfit".into());
                    }
                }
            } else {
                return Err("shape is not a map".into());
            }
        }
    }
    let mut res: Vec<(String, V)> = Vec::new();
    for (k, v) in entries {
        if let Some(slot) = res.iter_mut().find(|(rk, _)| *rk == k) {
            if !same_val(&slot.1, &v) {
                return Err("duplicate key with different value".into());
            }
            slot.1 = v;
        } else {
            res.push((k, v));
        }
    }
    let mut m = Map::new();
    for (k, v) in &res {
        m.insert(k.clone(), to_json(v));
    }
    Ok(Value::Object(m))
}
