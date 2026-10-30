use serde_json::{Map, Value};
use std::collections::BTreeMap;

#[derive(Clone, Debug)]
enum Tok { Str(String), Chr(String), Num(f64, bool), Bool(bool), Ident(String), P(String) }

#[derive(Clone, Debug)]
enum Rv { T(String), N(f64), B(bool), Nil, L(Vec<Rv>) }

type R<T> = Result<T, String>;

fn er<T>(m: &str) -> R<T> { Err(m.to_string()) }

fn unescape(b: &[char]) -> R<String> {
    let mut o = String::new();
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        if c != '\\' { o.push(c); i += 1; continue; }
        let n = match b.get(i + 1) { Some(c) => *c, None => return er("escape") };
        match n {
            'n' => { o.push('\n'); i += 2 }
            'r' => { o.push('\r'); i += 2 }
            't' => { o.push('\t'); i += 2 }
            '0' => { o.push('\0'); i += 2 }
            '\\' | '\'' | '"' => { o.push(n); i += 2 }
            'x' => {
                let h = b.get(i + 2).and_then(|c| c.to_digit(16));
                let l = b.get(i + 3).and_then(|c| c.to_digit(16));
                match (h, l) {
                    (Some(h), Some(l)) => { o.push(char::from_u32(h * 16 + l).unwrap()); i += 4 }
                    _ => return er("escape"),
                }
            }
            'u' => {
                if b.get(i + 2) != Some(&'{') { return er("escape"); }
                let rel = match b[i + 3..].iter().position(|&c| c == '}') { Some(r) => r, None => return er("escape") };
                let end = i + 3 + rel;
                let hex: Vec<char> = b[i + 3..end].iter().cloned().filter(|c| *c != '_').collect();
                if hex.is_empty() || !hex.iter().all(|c| c.is_ascii_hexdigit()) { return er("escape"); }
                let mut v: u32 = 0;
                for c in hex {
                    v = v * 16 + c.to_digit(16).unwrap();
                    if v > 0x10FFFF { return er("escape"); }
                }
                match char::from_u32(v) { Some(ch) => o.push(ch), None => return er("escape") }
                i = end + 1;
            }
            '\n' | '\r' => {
                i += 2;
                while i < b.len() && matches!(b[i], ' ' | '\t' | '\r' | '\n') { i += 1; }
            }
            _ => return er("escape"),
        }
    }
    Ok(o)
}

fn char_lit(s: &[char], i: usize) -> R<Option<(String, usize)>> {
    let g = |k: usize| s.get(k).copied();
    let c1 = match g(i + 1) { Some(c) => c, None => return Ok(None) };
    if c1 == '\'' { return Ok(None); }
    if c1 != '\\' {
        return Ok(if g(i + 2) == Some('\'') { Some((c1.to_string(), i + 3)) } else { None });
    }
    let c2 = match g(i + 2) { Some(c) => c, None => return Ok(None) };
    let end;
    match c2 {
        'n' | 'r' | 't' | '0' | '\\' | '\'' | '"' => end = i + 3,
        'x' => {
            if g(i + 3).map_or(false, |c| c.is_ascii_hexdigit()) && g(i + 4).map_or(false, |c| c.is_ascii_hexdigit()) {
                end = i + 5;
            } else { return Ok(None); }
        }
        'u' => {
            if g(i + 3) != Some('{') { return Ok(None); }
            let mut m = 0;
            while m < 8 && g(i + 4 + m).map_or(false, |c| c == '_' || c.is_ascii_hexdigit()) { m += 1; }
            if m == 0 || g(i + 4 + m) != Some('}') { return Ok(None); }
            end = i + 4 + m + 1;
        }
        _ => return Ok(None),
    }
    if g(end) == Some('\'') {
        let d = unescape(&s[i + 1..end])?;
        Ok(Some((d, end + 1)))
    } else { Ok(None) }
}

fn pow2(t: usize) -> f64 { f64::from_bits(((t as u64) + 1023) << 52) }

fn lex_num(s: &[char], i: usize) -> (Tok, usize) {
    let w = &s[i..(i + 64).min(s.len())];
    let at = |k: usize| w.get(k).copied();
    let mut radix = 10u32;
    let mut k = 0usize;
    let mut bs = 0usize;
    let r = match at(1) { Some('x') => 16, Some('o') => 8, Some('b') => 2, _ => 10 };
    if w[0] == '0' && r != 10 {
        let isd = |c: char| c == '_' || c.is_digit(r);
        if at(2).map_or(false, isd) {
            radix = r;
            k = 2;
            bs = 2;
            while at(k).map_or(false, isd) { k += 1; }
        }
    }
    let (mut frac, mut exp) = (false, false);
    if radix == 10 {
        while at(k).map_or(false, |c| c.is_ascii_digit() || c == '_') { k += 1; }
        if at(k) == Some('.') && at(k + 1).map_or(false, |c| c.is_ascii_digit()) {
            frac = true;
            k += 2;
            while at(k).map_or(false, |c| c.is_ascii_digit() || c == '_') { k += 1; }
        }
        if matches!(at(k), Some('e') | Some('E')) {
            let mut m = k + 1;
            if matches!(at(m), Some('+') | Some('-')) { m += 1; }
            if at(m).map_or(false, |c| c.is_ascii_digit()) {
                exp = true;
                k = m + 1;
                while at(k).map_or(false, |c| c.is_ascii_digit() || c == '_') { k += 1; }
            }
        }
    }
    let body: String = w[bs..k].iter().filter(|c| **c != '_').collect();
    let mut suf = "";
    for sf in ["u128", "usize", "u16", "u32", "u64", "u8", "i128", "isize", "i16", "i32", "i64", "i8", "f32", "f64"] {
        let sc: Vec<char> = sf.chars().collect();
        if w.len() >= k + sc.len() && w[k..k + sc.len()] == sc[..] { suf = sf; break; }
    }
    let used = k + suf.len();
    let mut exact = true;
    let mut v = 0.0f64;
    if radix != 10 || (!frac && !exp) {
        if radix != 10 {
            let bits_per = match radix { 16 => 4, 8 => 3, _ => 1 };
            let mut bits: Vec<bool> = Vec::new();
            for c in body.chars() {
                let d = c.to_digit(radix).unwrap();
                for sh in (0..bits_per).rev() { bits.push((d >> sh) & 1 == 1); }
            }
            let lead = bits.iter().position(|b| *b);
            if body.is_empty() { exact = false; }
            else if let Some(p) = lead {
                let bits = &bits[p..];
                let l = bits.len();
                let t = bits.iter().rev().take_while(|b| !**b).count();
                if l - t <= 53 && l <= 1024 {
                    let mut m = 0u64;
                    for b in &bits[..l - t] { m = m * 2 + (*b as u64); }
                    v = m as f64 * pow2(t);
                } else { exact = false; }
            }
        } else {
            let mut d: Vec<u8> = body.bytes().map(|b| b - b'0').collect();
            while d.first() == Some(&0) { d.remove(0); }
            if !d.is_empty() {
                let mut t = 0usize;
                while d.last().map_or(false, |x| x % 2 == 0) {
                    let mut rem = 0u8;
                    for x in d.iter_mut() {
                        let cur = rem * 10 + *x;
                        *x = cur / 2;
                        rem = cur % 2;
                    }
                    while d.first() == Some(&0) { d.remove(0); }
                    t += 1;
                }
                if d.len() > 16 { exact = false; } else {
                    let mut m = 0u64;
                    for x in &d { m = m * 10 + *x as u64; }
                    let bl = 64 - m.leading_zeros() as usize;
                    if m >= (1u64 << 53) || bl + t > 1024 { exact = false; } else { v = m as f64 * pow2(t); }
                }
            }
        }
    } else {
        match body.parse::<f64>() {
            Ok(x) if x.is_finite() => v = x,
            _ => exact = false,
        }
    }
    if exact && suf == "f32" && radix != 16 {
        let f = v as f32;
        if !f.is_finite() || f as f64 != v { exact = false; }
    }
    (Tok::Num(v, exact), i + used)
}

fn lex(s: &[char]) -> R<Vec<Tok>> {
    let n = s.len();
    let mut out = Vec::new();
    let mut i = 0;
    while i < n {
        let c = s[i];
        if matches!(c, ' ' | '\t' | '\r' | '\n') { i += 1; continue; }
        if c == '/' && s.get(i + 1) == Some(&'/') {
            while i < n && s[i] != '\n' { i += 1; }
            continue;
        }
        if c == '/' && s.get(i + 1) == Some(&'*') {
            let mut depth = 1;
            i += 2;
            while i < n && depth > 0 {
                if s[i] == '/' && s.get(i + 1) == Some(&'*') { depth += 1; i += 2; }
                else if s[i] == '*' && s.get(i + 1) == Some(&'/') { depth -= 1; i += 2; }
                else { i += 1; }
            }
            continue;
        }
        if c == 'b' || c == 'r' {
            let mut j = i;
            if s[j] == 'b' { j += 1; }
            if s.get(j) == Some(&'r') {
                j += 1;
                let mut h = 0;
                while s.get(j) == Some(&'#') { h += 1; j += 1; }
                if s.get(j) == Some(&'"') && j + 1 - i <= 32 {
                    let st = j + 1;
                    let mut k = st;
                    let mut found = None;
                    while k < n {
                        if s[k] == '"' && (0..h).all(|q| s.get(k + 1 + q) == Some(&'#')) { found = Some(k); break; }
                        k += 1;
                    }
                    match found {
                        Some(e) => { out.push(Tok::Str(s[st..e].iter().collect())); i = e + 1 + h; continue; }
                        None => return er("raw string"),
                    }
                }
            }
        }
        if c == '"' || (c == 'b' && s.get(i + 1) == Some(&'"')) {
            let st = if c == '"' { i + 1 } else { i + 2 };
            let mut j = st;
            let mut closed = false;
            while j < n {
                if s[j] == '\\' { j += 2; } else if s[j] == '"' { closed = true; break; } else { j += 1; }
            }
            if !closed { return er("unterminated string"); }
            out.push(Tok::Str(unescape(&s[st..j])?));
            i = j + 1;
            continue;
        }
        if c == '\'' {
            if let Some((d, e)) = char_lit(s, i)? { out.push(Tok::Chr(d)); i = e; }
            else { out.push(Tok::P("'".into())); i += 1; }
            continue;
        }
        if c.is_ascii_digit() {
            let (t, e) = lex_num(s, i);
            out.push(t);
            i = e;
            continue;
        }
        if c.is_ascii_alphabetic() || c == '_' {
            let mut j = i;
            while j < n && (s[j].is_ascii_alphanumeric() || s[j] == '_') { j += 1; }
            let w: String = s[i..j].iter().collect();
            out.push(match w.as_str() { "true" => Tok::Bool(true), "false" => Tok::Bool(false), _ => Tok::Ident(w) });
            i = j;
            continue;
        }
        if let Some(&d) = s.get(i + 1) {
            if matches!((c, d), ('=', '>') | ('-', '>') | (':', ':') | ('.', '.')) {
                out.push(Tok::P(format!("{}{}", c, d)));
                i += 2;
                continue;
            }
        }
        out.push(Tok::P(c.to_string()));
        i += 1;
    }
    Ok(out)
}

fn is_p(t: &[Tok], i: usize, p: &str) -> bool { matches!(t.get(i), Some(Tok::P(x)) if x == p) }
fn is_id(t: &[Tok], i: usize, p: &str) -> bool { matches!(t.get(i), Some(Tok::Ident(x)) if x == p) }

fn cast(t: &[Tok], q: usize, x: f64) -> R<(Rv, usize)> {
    if !is_id(t, q, "as") { return Ok((Rv::N(x), q)); }
    let name = match t.get(q + 1) { Some(Tok::Ident(n)) => n.as_str(), _ => return er("cast") };
    let p53 = 9007199254740992.0f64;
    let int = |lo: f64, hi: f64| -> R<(Rv, usize)> {
        if x.is_finite() && x.fract() == 0.0 && x >= lo && x <= hi {
            Ok((Rv::N(if x == 0.0 { 0.0 } else { x }), q + 2))
        } else { er("cast") }
    };
    match name {
        "f64" => Ok((Rv::N(x), q + 2)),
        "f32" => {
            let f = x as f32;
            if f.is_finite() && f as f64 == x { Ok((Rv::N(x), q + 2)) } else { er("cast") }
        }
        "u8" => int(0.0, 255.0),
        "u16" => int(0.0, 65535.0),
        "u32" => int(0.0, 4294967295.0),
        "i8" => int(-128.0, 127.0),
        "i16" => int(-32768.0, 32767.0),
        "i32" => int(-2147483648.0, 2147483647.0),
        "u64" | "usize" | "u128" => int(0.0, p53),
        "i64" | "isize" | "i128" => int(-p53, p53),
        _ => er("cast"),
    }
}

fn read_value(t: &[Tok], p: usize) -> R<Option<(Rv, usize)>> {
    match t.get(p) {
        None => Ok(None),
        Some(Tok::P(x)) if x == "&" => read_value(t, p + 1),
        Some(Tok::Str(s)) | Some(Tok::Chr(s)) => Ok(Some((Rv::T(s.clone()), p + 1))),
        Some(Tok::Bool(b)) => Ok(Some((Rv::B(*b), p + 1))),
        Some(Tok::Num(v, e)) => {
            if !*e { return er("inexact"); }
            Ok(Some(cast(t, p + 1, *v)?))
        }
        Some(Tok::P(x)) if x == "-" => {
            if let Some(Tok::Num(v, e)) = t.get(p + 1) {
                if !*e { return er("inexact"); }
                Ok(Some(cast(t, p + 2, -*v)?))
            } else { Ok(None) }
        }
        Some(Tok::Ident(x)) if x == "None" => Ok(Some((Rv::Nil, p + 1))),
        Some(Tok::Ident(x)) if x == "Some" => {
            if !is_p(t, p + 1, "(") { return Ok(None); }
            if is_id(t, p + 2, "Some") || is_id(t, p + 2, "None") { return er("nested option"); }
            match read_value(t, p + 2)? {
                Some((v, e)) if is_p(t, e, ")") => Ok(Some((v, e + 1))),
                _ => Ok(None),
            }
        }
        Some(Tok::P(x)) if x == "[" || x == "(" => {
            let closer = if x == "[" { "]" } else { ")" };
            let paren = x == "(";
            let mut q = p + 1;
            let mut items = Vec::new();
            let mut comma = false;
            loop {
                if is_p(t, q, closer) { q += 1; break; }
                match read_value(t, q)? {
                    None => return Ok(None),
                    Some((v, e)) => {
                        items.push(v);
                        if is_p(t, e, ",") { comma = true; q = e + 1; }
                        else if is_p(t, e, closer) { q = e + 1; break; }
                        else { return Ok(None); }
                    }
                }
            }
            if paren && items.len() == 1 && !comma { Ok(Some((items.pop().unwrap(), q))) }
            else { Ok(Some((Rv::L(items), q))) }
        }
        _ => Ok(None),
    }
}

fn scan(t: &[Tok]) -> R<(Vec<(String, Rv)>, Vec<(String, Rv)>)> {
    let (mut tup, mut arms) = (Vec::new(), Vec::new());
    let mut i = 0;
    while i < t.len() {
        if is_p(t, i, "(") {
            if let (Some(Tok::Str(k)), true) = (t.get(i + 1), is_p(t, i + 2, ",")) {
                match read_value(t, i + 3)? {
                    None => return er("tuple value"),
                    Some((v, e)) => {
                        if is_p(t, e, ")") { tup.push((k.clone(), v)); i = e + 1; continue; }
                    }
                }
            }
        } else if let Tok::Str(k) = &t[i] {
            if is_p(t, i + 1, "|") && matches!(t.get(i + 2), Some(Tok::Str(_))) { return er("or-pattern"); }
            if is_p(t, i + 1, "=>") {
                match read_value(t, i + 2)? {
                    Some((v, e)) if is_p(t, e, ",") || is_p(t, e, "}") => { arms.push((k.clone(), v)); i = e; continue; }
                    _ => return er("arm"),
                }
            }
        }
        i += 1;
    }
    Ok((tup, arms))
}

#[derive(Clone, Debug)]
enum Ty { Text, Bytes, Bool, Nil, I64, U64, F64, Json, Tuple(Vec<Ty>), List(Box<Ty>), Map(Box<Ty>, Box<Ty>), Rec(Vec<(String, Ty)>), U(Vec<Ty>) }

fn same(a: &Ty, b: &Ty) -> bool {
    match (a, b) {
        (Ty::List(x), Ty::List(y)) => same(x, y),
        (Ty::Tuple(x), Ty::Tuple(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q)),
        (Ty::Map(a1, a2), Ty::Map(b1, b2)) => same(a1, b1) && same(a2, b2),
        (Ty::Rec(x), Ty::Rec(y)) => x.len() == y.len() && x.iter().all(|(n, t)| y.iter().any(|(m, u)| n == m && same(t, u))),
        (Ty::U(x), Ty::U(y)) => x.iter().all(|p| y.iter().any(|q| same(p, q))) && y.iter().all(|q| x.iter().any(|p| same(p, q))),
        _ => std::mem::discriminant(a) == std::mem::discriminant(b),
    }
}

fn jacc(b: &Ty) -> bool {
    match b {
        Ty::Nil | Ty::Bool | Ty::F64 | Ty::Text | Ty::Json => true,
        Ty::List(x) => jacc(x),
        Ty::Tuple(x) => x.iter().all(jacc),
        Ty::Map(k, v) => matches!(**k, Ty::Text) && jacc(v),
        Ty::Rec(f) => f.iter().all(|(_, t)| jacc(t)),
        Ty::U(x) => x.iter().all(jacc),
        _ => false,
    }
}

fn covers(a: &Ty, b: &Ty) -> bool {
    if same(a, b) { return true; }
    if matches!(a, Ty::Json) && jacc(b) { return true; }
    match (a, b) {
        (Ty::List(x), Ty::List(y)) if covers(x, y) => return true,
        (Ty::Tuple(x), Ty::Tuple(y)) if x.len() == y.len() && x.iter().zip(y).all(|(p, q)| covers(p, q)) => return true,
        (Ty::Map(k1, v1), Ty::Map(k2, v2)) if covers(k1, k2) && covers(v1, v2) => return true,
        (Ty::Rec(x), Ty::Rec(y)) if x.iter().all(|(n, t)| y.iter().any(|(m, u)| n == m && covers(t, u))) => return true,
        _ => {}
    }
    if let Ty::U(x) = a { if x.iter().any(|p| covers(p, b)) { return true; } }
    if let Ty::U(y) = b { if y.iter().all(|q| covers(a, q)) { return true; } }
    false
}

struct Ps { c: Vec<char>, i: usize }

impl Ps {
    fn ws(&mut self) { while self.i < self.c.len() && matches!(self.c[self.i], ' ' | '\t' | '\r' | '\n') { self.i += 1; } }
    fn peek(&mut self) -> Option<char> { self.ws(); self.c.get(self.i).copied() }
    fn expect(&mut self, ch: char) -> R<()> {
        if self.peek() == Some(ch) { self.i += 1; Ok(()) } else { er("shape") }
    }
    fn word(&mut self) -> R<String> {
        self.ws();
        let st = self.i;
        while self.i < self.c.len() && (self.c[self.i].is_ascii_alphanumeric() || self.c[self.i] == '_') { self.i += 1; }
        if st == self.i || self.c[st].is_ascii_digit() { return er("shape"); }
        Ok(self.c[st..self.i].iter().collect())
    }
    fn ty(&mut self, d: usize) -> R<Ty> {
        let mut alts = vec![self.alt(d)?];
        while self.peek() == Some('|') {
            self.i += 1;
            alts.push(self.alt(d)?);
        }
        for j in 1..alts.len() {
            for i in 0..j {
                if covers(&alts[i], &alts[j]) { return er("covered"); }
            }
        }
        Ok(if alts.len() == 1 { alts.pop().unwrap() } else { Ty::U(alts) })
    }
    fn alt(&mut self, d: usize) -> R<Ty> {
        let w = self.word()?;
        Ok(match w.as_str() {
            "text" => Ty::Text, "bytes" => Ty::Bytes, "bool" => Ty::Bool, "none" => Ty::Nil,
            "i64" => Ty::I64, "u64" => Ty::U64, "f64" => Ty::F64, "json" => Ty::Json,
            "tuple" | "list" | "map" | "record" => {
                if d + 1 > 16 { return er("deep"); }
                let d = d + 1;
                self.expect('[')?;
                let r = match w.as_str() {
                    "tuple" => {
                        let mut v = vec![self.ty(d)?];
                        while self.peek() == Some(',') { self.i += 1; v.push(self.ty(d)?); }
                        Ty::Tuple(v)
                    }
                    "list" => Ty::List(Box::new(self.ty(d)?)),
                    "map" => {
                        let k = self.ty(d)?;
                        self.expect(',')?;
                        let v = self.ty(d)?;
                        Ty::Map(Box::new(k), Box::new(v))
                    }
                    _ => {
                        let mut f: Vec<(String, Ty)> = Vec::new();
                        loop {
                            let n = self.word()?;
                            if f.iter().any(|(m, _)| *m == n) { return er("dup field"); }
                            self.expect(':')?;
                            let t = self.ty(d)?;
                            f.push((n, t));
                            if self.peek() == Some(',') { self.i += 1; } else { break; }
                        }
                        Ty::Rec(f)
                    }
                };
                self.expect(']')?;
                r
            }
            _ => return er("shape word"),
        })
    }
}

fn is_ws(c: char) -> bool { matches!(c, ' ' | '\t' | '\r' | '\n') }

fn norm(t: &[char]) -> Vec<char> {
    let mut a = 0;
    let mut b = t.len();
    while a < b && is_ws(t[a]) { a += 1; }
    while b > a && is_ws(t[b - 1]) { b -= 1; }
    let t = &t[a..b];
    if t.len() > 3 && t[..3] == ['m', 'a', 'p'] && is_ws(t[3]) {
        let mut w = 3;
        while w < t.len() && is_ws(t[w]) { w += 1; }
        let mut s = w;
        while s >= 4 {
            for e in s + 1..=t.len() {
                let mut j = e;
                while j < t.len() && is_ws(t[j]) { j += 1; }
                if j + 1 < t.len() + 0 && t[j] == '-' && t[j + 1] == '>' {
                    let mut v = j + 2;
                    let save = v;
                    while v < t.len() && is_ws(t[v]) { v += 1; }
                    let vs: &[char] = if v < t.len() { &t[v..] } else if save < t.len() { &t[t.len() - 1..] } else { &[] };
                    if vs.is_empty() && save >= t.len() { continue; }
                    let mut o: Vec<char> = "map[".chars().collect();
                    o.extend(norm(&t[s..e]));
                    o.extend(", ".chars());
                    o.extend(norm(vs));
                    o.push(']');
                    return o;
                }
            }
            s -= 1;
        }
    }
    t.to_vec()
}

fn widen(t: &[char]) -> String {
    let mut o = String::new();
    let mut i = 0;
    while i < t.len() {
        if t[i].is_ascii_alphanumeric() || t[i] == '_' {
            let st = i;
            while i < t.len() && (t[i].is_ascii_alphanumeric() || t[i] == '_') { i += 1; }
            let w: String = t[st..i].iter().collect();
            let mut b = st;
            while b > 0 && is_ws(t[b - 1]) { b -= 1; }
            let prev_ok = b == 0 || matches!(t[b - 1], '[' | ',' | '|' | ':');
            let mut f = i;
            while f < t.len() && is_ws(t[f]) { f += 1; }
            let next_ok = f >= t.len() || matches!(t[f], ']' | ',' | '|');
            if prev_ok && next_ok && matches!(w.as_str(), "u8" | "u16" | "u32" | "i8" | "i16" | "i32") {
                o.push_str(&w[..1]);
                o.push_str("64");
            } else { o.push_str(&w); }
        } else { o.push(t[i]); i += 1; }
    }
    o
}

fn fit(v: &Rv, t: &Ty) -> bool {
    match t {
        Ty::Text => matches!(v, Rv::T(_)),
        Ty::Bool => matches!(v, Rv::B(_)),
        Ty::Nil => matches!(v, Rv::Nil),
        Ty::F64 => matches!(v, Rv::N(_)),
        Ty::I64 => matches!(v, Rv::N(x) if x.fract() == 0.0 && *x >= -9223372036854775808.0 && *x < 9223372036854775808.0),
        Ty::U64 => matches!(v, Rv::N(x) if x.fract() == 0.0 && *x >= 0.0 && *x < 18446744073709551616.0),
        Ty::Json => true,
        Ty::List(i) => matches!(v, Rv::L(l) if l.iter().all(|x| fit(x, i))),
        Ty::Tuple(ts) => matches!(v, Rv::L(l) if l.len() == ts.len() && l.iter().zip(ts).all(|(x, t)| fit(x, t))),
        Ty::U(a) => a.iter().any(|t| fit(v, t)),
        _ => false,
    }
}

fn same_in(a: &Rv, b: &Rv, inlist: bool) -> bool {
    match (a, b) {
        (Rv::L(x), Rv::L(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same_in(p, q, true)),
        (Rv::L(_), _) | (_, Rv::L(_)) => false,
        (Rv::T(x), Rv::T(y)) => x == y,
        (Rv::B(x), Rv::B(y)) => x == y,
        (Rv::Nil, Rv::Nil) => true,
        (Rv::N(x), Rv::N(y)) => if inlist { x == y } else { x.to_bits() == y.to_bits() },
        _ => false,
    }
}

fn to_json(v: &Rv) -> Value {
    match v {
        Rv::T(s) => Value::String(s.clone()),
        Rv::N(x) => Value::from(*x),
        Rv::B(b) => Value::Bool(*b),
        Rv::Nil => Value::Null,
        Rv::L(l) => Value::Array(l.iter().map(to_json).collect()),
    }
}

pub fn rust_carried_table(src: &str, shape: Option<&str>) -> Result<Value, String> {
    let s: Vec<char> = src.chars().collect();
    let toks = lex(&s)?;
    let (tup, arms) = scan(&toks)?;
    let entries = if !tup.is_empty() { tup } else { arms };
    if entries.is_empty() { return er("no entries"); }
    if let Some(sh) = shape {
        if !sh.is_empty() {
            let cut: Vec<char> = match sh.find(';') { Some(p) => sh[..p].chars().collect(), None => sh.chars().collect() };
            let n = norm(&cut);
            let text = widen(&n);
            let mut ps = Ps { c: text.chars().collect(), i: 0 };
            let ty = ps.ty(0)?;
            ps.ws();
            if ps.i != ps.c.len() { return er("shape trailing"); }
            if let Ty::Map(kt, vt) = ty {
                for (k, v) in &entries {
                    if !fit(&Rv::T(k.clone()), &kt) || !fit(v, &vt) { return er("misfit"); }
                }
            } else { return er("not a map"); }
        }
    }
    let mut res: BTreeMap<String, Rv> = BTreeMap::new();
    for (k, v) in entries {
        if let Some(old) = res.get(&k) {
            if !same_in(old, &v, false) { return er("duplicate"); }
        }
        res.insert(k, v);
    }
    let mut m = Map::new();
    for (k, v) in &res { m.insert(k.clone(), to_json(v)); }
    Ok(Value::Object(m))
}
