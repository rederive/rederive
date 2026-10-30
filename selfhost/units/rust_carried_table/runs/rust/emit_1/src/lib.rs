use serde_json::Value;
use std::collections::HashMap;

type R<T> = Result<T, String>;
fn er<T>(m: &str) -> R<T> { Err(m.to_string()) }

#[derive(Clone, Debug)]
enum V { T(String), B(bool), N0, F(f64), L(Vec<V>) }

#[derive(Clone, Debug)]
enum Tok { Str(String), Chr(String), Bool(bool), Id(String), Num(f64, bool), P(String) }

fn isp(t: Option<&Tok>, s: &str) -> bool { matches!(t, Some(Tok::P(p)) if p == s) }

fn is_trim(c: char) -> bool {
    matches!(c as u32, 9..=13 | 0x20 | 0xA0 | 0x1680 | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF)
}

fn uhex(h: &str) -> R<char> {
    let cs: Vec<char> = h.chars().collect();
    let f = match cs.first() { Some(f) => *f, None => return er("empty hex") };
    if !(f.is_ascii_hexdigit() || is_trim(f) || f == '+' || f == '-') { return er("bad hex"); }
    let (mut i, mut neg) = (0, false);
    if !cs.iter().all(|c| c.is_ascii_hexdigit()) {
        while i < cs.len() && is_trim(cs[i]) { i += 1; }
        if i < cs.len() && (cs[i] == '+' || cs[i] == '-') { neg = cs[i] == '-'; i += 1; }
        if i + 1 < cs.len() && cs[i] == '0' && (cs[i + 1] == 'x' || cs[i + 1] == 'X') { i += 2; }
    }
    let mut v: u64 = 0;
    while i < cs.len() && cs[i].is_ascii_hexdigit() {
        v = v * 16 + cs[i].to_digit(16).unwrap() as u64;
        if v > 0x10FFFF { return er("too big"); }
        i += 1;
    }
    if neg && v != 0 { return er("negative"); }
    char::from_u32(v as u32).ok_or_else(|| "bad code point".to_string())
}

fn unesc(b: &[char]) -> R<String> {
    let mut o = String::new();
    let mut i = 0;
    while i < b.len() {
        let ch = b[i];
        i += 1;
        if ch != '\\' { o.push(ch); continue; }
        let e = match b.get(i) { Some(e) => *e, None => return er("bad escape") };
        i += 1;
        match e {
            'n' => o.push('\n'), 'r' => o.push('\r'), 't' => o.push('\t'), '0' => o.push('\0'),
            '\\' | '\'' | '"' => o.push(e),
            'x' => {
                let d = |k: usize| b.get(k).and_then(|c| c.to_digit(16));
                match (d(i), d(i + 1)) {
                    (Some(x), Some(y)) => o.push(char::from_u32(x * 16 + y).unwrap()),
                    _ => return er("bad \\x"),
                }
                i += 2;
            }
            'u' => {
                if b.get(i) != Some(&'{') { return er("bad \\u"); }
                let close = match b[i + 1..].iter().position(|c| *c == '}') { Some(p) => i + 1 + p, None => return er("no }") };
                let h: String = b[i + 1..close].iter().filter(|c| **c != '_').collect();
                o.push(uhex(&h)?);
                i = close + 1;
            }
            '\n' | '\r' => { while i < b.len() && matches!(b[i], ' ' | '\t' | '\r' | '\n') { i += 1; } }
            _ => return er("unknown escape"),
        }
    }
    Ok(o)
}

fn char_lit(c: &[char], i: usize) -> Option<(Vec<char>, usize)> {
    let n = c.len();
    let a = *c.get(i + 1)?;
    if a == '\'' { return None; }
    if a != '\\' { return if i + 2 < n && c[i + 2] == '\'' { Some((vec![a], i + 3)) } else { None }; }
    let e = *c.get(i + 2)?;
    if "nrt0\\'\"".contains(e) { return if c.get(i + 3) == Some(&'\'') { Some((c[i + 1..i + 3].to_vec(), i + 4)) } else { None }; }
    if e == 'x' {
        let ok = c.get(i + 3).map_or(false, |x| x.is_ascii_hexdigit()) && c.get(i + 4).map_or(false, |x| x.is_ascii_hexdigit()) && c.get(i + 5) == Some(&'\'');
        return if ok { Some((c[i + 1..i + 5].to_vec(), i + 6)) } else { None };
    }
    if e == 'u' && c.get(i + 3) == Some(&'{') {
        let mut k = i + 4;
        while k < n && (c[k].is_ascii_hexdigit() || c[k] == '_') && k - (i + 4) < 8 { k += 1; }
        if k > i + 4 && c.get(k) == Some(&'}') && c.get(k + 1) == Some(&'\'') { return Some((c[i + 1..k + 1].to_vec(), k + 2)); }
    }
    None
}

fn is2(c: &[char], i: usize, a: char, b: char) -> bool { c[i] == a && i + 1 < c.len() && c[i + 1] == b }

fn radix_val(digs: &[char], r: u32, bits: usize) -> (f64, bool) {
    if digs.is_empty() { return (0.0, false); }
    let mut bv: Vec<u8> = Vec::new();
    for d in digs {
        let x = d.to_digit(r).unwrap();
        for k in (0..bits).rev() { bv.push(((x >> k) & 1) as u8); }
    }
    let bv = match bv.iter().position(|b| *b == 1) { None => return (0.0, true), Some(z) => &bv[z..] };
    let l = bv.len();
    let t = bv.iter().rev().take_while(|b| **b == 0).count();
    if l - t > 53 || l > 1024 { return (0.0, false); }
    let mut m: u64 = 0;
    for b in &bv[..l - t] { m = m * 2 + *b as u64; }
    (m as f64 * 2f64.powi(t as i32), true)
}

fn dec_val(digs: &[char]) -> (f64, bool) {
    let mut d: Vec<u32> = digs.iter().map(|c| c.to_digit(10).unwrap()).collect();
    while d.first() == Some(&0) { d.remove(0); }
    if d.is_empty() { return (0.0, true); }
    let mut t = 0i32;
    while d.last().map_or(false, |x| x % 2 == 0) {
        let mut carry = 0;
        for x in d.iter_mut() { let cur = carry * 10 + *x; *x = cur / 2; carry = cur % 2; }
        while d.first() == Some(&0) { d.remove(0); }
        t += 1;
    }
    if d.len() > 16 { return (0.0, false); }
    let m = d.iter().fold(0u64, |a, x| a * 10 + *x as u64);
    if m >= (1u64 << 53) || (64 - m.leading_zeros()) as i32 + t > 1024 { return (0.0, false); }
    (m as f64 * 2f64.powi(t), true)
}

fn lex_num(c: &[char], i: usize) -> (Tok, usize) {
    let w = &c[i..(i + 64).min(c.len())];
    let n = w.len();
    let mut q = 0;
    let mut radix = 0u32;
    let mut frac = false;
    let dg = |k: usize| k < n && (w[k].is_ascii_digit() || w[k] == '_');
    if n >= 3 && w[0] == '0' && matches!(w[1], 'x' | 'o' | 'b') {
        let r = match w[1] { 'x' => 16, 'o' => 8, _ => 2 };
        q = 2;
        while q < n && (w[q].to_digit(r).is_some() || w[q] == '_') { q += 1; }
        if q > 2 { radix = r; }
    }
    if radix == 0 {
        q = 1;
        while dg(q) { q += 1; }
        if q + 1 < n && w[q] == '.' && w[q + 1].is_ascii_digit() {
            frac = true;
            q += 2;
            while dg(q) { q += 1; }
        }
        if q < n && (w[q] == 'e' || w[q] == 'E') {
            let mut r = q + 1;
            if r < n && (w[r] == '+' || w[r] == '-') { r += 1; }
            if r < n && w[r].is_ascii_digit() {
                frac = true;
                r += 1;
                while dg(r) { r += 1; }
                q = r;
            }
        }
    }
    let body: Vec<char> = w[..q].iter().filter(|c| **c != '_').copied().collect();
    let mut s = q;
    if s < n && w[s] == '_' { s += 1; }
    let rest: String = w[s..].iter().collect();
    let mut suf = "";
    for x in ["u8", "u16", "u32", "u64", "u128", "usize", "i8", "i16", "i32", "i64", "i128", "isize", "f32", "f64"] {
        if rest.starts_with(x) { suf = x; break; }
    }
    let end = if suf.is_empty() { q } else { s + suf.len() };
    let (mut x, mut ok) = if radix != 0 {
        radix_val(&body[2..], radix, match radix { 16 => 4, 8 => 3, _ => 1 })
    } else if frac {
        let st: String = body.iter().collect();
        match st.parse::<f64>() { Ok(v) if v.is_finite() => (v, true), _ => (0.0, false) }
    } else {
        dec_val(&body)
    };
    if suf == "f32" && radix != 16 && ok {
        let y = x as f32;
        if y.is_infinite() || y as f64 != x { ok = false; }
    }
    if !ok { x = 0.0; }
    (Tok::Num(x, !ok), i + end)
}

fn lex(c: &[char]) -> R<Vec<Tok>> {
    let n = c.len();
    let mut t = Vec::new();
    let mut i = 0;
    while i < n {
        let ch = c[i];
        if matches!(ch, ' ' | '\t' | '\r' | '\n') { i += 1; continue; }
        if is2(c, i, '/', '/') { while i < n && c[i] != '\n' { i += 1; } continue; }
        if is2(c, i, '/', '*') {
            let mut d = 1;
            i += 2;
            while i < n && d > 0 {
                if is2(c, i, '/', '*') { d += 1; i += 2; } else if is2(c, i, '*', '/') { d -= 1; i += 2; } else { i += 1; }
            }
            continue;
        }
        if ch == 'b' || ch == 'r' {
            let mut j = i;
            if c[j] == 'b' { j += 1; }
            if j < n && c[j] == 'r' {
                j += 1;
                let mut h = 0;
                while j < n && c[j] == '#' && j - i < 32 { h += 1; j += 1; }
                if j < n && c[j] == '"' && j - i < 32 {
                    let st = j + 1;
                    let mut k = st;
                    loop {
                        if k >= n { return er("unterminated raw string"); }
                        if c[k] == '"' && (1..=h).all(|z| k + z < n && c[k + z] == '#') { break; }
                        k += 1;
                    }
                    t.push(Tok::Str(c[st..k].iter().collect()));
                    i = k + 1 + h;
                    continue;
                }
            }
        }
        if ch == '"' || (ch == 'b' && i + 1 < n && c[i + 1] == '"') {
            let st = if ch == 'b' { i + 2 } else { i + 1 };
            let mut k = st;
            loop {
                if k >= n { return er("unterminated string"); }
                if c[k] == '\\' { k += 2; } else if c[k] == '"' { break; } else { k += 1; }
            }
            t.push(Tok::Str(unesc(&c[st..k])?));
            i = k + 1;
            continue;
        }
        if ch == '\'' {
            if let Some((b, e)) = char_lit(c, i) { t.push(Tok::Chr(unesc(&b)?)); i = e; } else { t.push(Tok::P("'".into())); i += 1; }
            continue;
        }
        if ch.is_ascii_digit() { let (tk, e) = lex_num(c, i); t.push(tk); i = e; continue; }
        if ch.is_ascii_alphabetic() || ch == '_' {
            let mut k = i;
            while k < n && (c[k].is_ascii_alphanumeric() || c[k] == '_') { k += 1; }
            let w: String = c[i..k].iter().collect();
            t.push(match w.as_str() { "true" => Tok::Bool(true), "false" => Tok::Bool(false), _ => Tok::Id(w) });
            i = k;
            continue;
        }
        if is2(c, i, '=', '>') || is2(c, i, '-', '>') || is2(c, i, ':', ':') || is2(c, i, '.', '.') {
            t.push(Tok::P(c[i..i + 2].iter().collect()));
            i += 2;
            continue;
        }
        t.push(Tok::P(ch.to_string()));
        i += 1;
    }
    Ok(t)
}

fn cast(t: &[Tok], p: usize, x: f64) -> R<(V, usize)> {
    if let Some(Tok::Id(a)) = t.get(p) {
        if a == "as" {
            let ty = match t.get(p + 1) { Some(Tok::Id(n)) => n.as_str(), _ => return er("bad cast") };
            let int = x.fract() == 0.0;
            let p53 = 9007199254740992.0f64;
            let rng = |lo: f64, hi: f64| int && x >= lo && x <= hi;
            let ok = match ty {
                "f64" => true,
                "f32" => { let y = x as f32; y.is_finite() && y as f64 == x }
                "u8" => rng(0.0, 255.0), "u16" => rng(0.0, 65535.0), "u32" => rng(0.0, 4294967295.0),
                "i8" => rng(-128.0, 127.0), "i16" => rng(-32768.0, 32767.0), "i32" => rng(-2147483648.0, 2147483647.0),
                "u64" | "usize" | "u128" => rng(0.0, p53),
                "i64" | "isize" | "i128" => rng(-p53, p53),
                _ => false,
            };
            if !ok { return er("bad cast"); }
            let keep = ty == "f64" || ty == "f32";
            let x = if !keep && x == 0.0 { 0.0 } else { x };
            return Ok((V::F(x), p + 2));
        }
    }
    Ok((V::F(x), p))
}

fn val(t: &[Tok], p: usize) -> R<Option<(V, usize)>> {
    match t.get(p) {
        None => Ok(None),
        Some(Tok::P(s)) if s == "&" => { let mut q = p; while isp(t.get(q), "&") { q += 1; } val(t, q) }
        Some(Tok::Str(s)) | Some(Tok::Chr(s)) => Ok(Some((V::T(s.clone()), p + 1))),
        Some(Tok::Bool(b)) => Ok(Some((V::B(*b), p + 1))),
        Some(Tok::Num(x, inx)) => { if *inx { return er("inexact"); } Ok(Some(cast(t, p + 1, *x)?)) }
        Some(Tok::P(s)) if s == "-" => {
            if let Some(Tok::Num(x, inx)) = t.get(p + 1) {
                if *inx { return er("inexact"); }
                return Ok(Some(cast(t, p + 2, -*x)?));
            }
            Ok(None)
        }
        Some(Tok::Id(s)) if s == "None" => Ok(Some((V::N0, p + 1))),
        Some(Tok::Id(s)) if s == "Some" => {
            if !isp(t.get(p + 1), "(") { return Ok(None); }
            if let Some(Tok::Id(n)) = t.get(p + 2) { if n == "Some" || n == "None" { return er("nested option"); } }
            match val(t, p + 2)? { Some((v, q)) if isp(t.get(q), ")") => Ok(Some((v, q + 1))), _ => Ok(None) }
        }
        Some(Tok::P(s)) if s == "[" || s == "(" => {
            let close = if s == "[" { "]" } else { ")" };
            let mut q = p + 1;
            let mut items = Vec::new();
            let mut comma = false;
            loop {
                if isp(t.get(q), close) { q += 1; break; }
                match val(t, q)? {
                    None => return Ok(None),
                    Some((v, r)) => {
                        items.push(v);
                        q = r;
                        if isp(t.get(q), ",") { comma = true; q += 1; }
                        else if isp(t.get(q), close) { q += 1; break; }
                        else { return Ok(None); }
                    }
                }
            }
            if s == "(" && items.len() == 1 && !comma { return Ok(Some((items.pop().unwrap(), q))); }
            Ok(Some((V::L(items), q)))
        }
        _ => Ok(None),
    }
}

fn scan(t: &[Tok]) -> R<Vec<(String, V)>> {
    let mut tuples = Vec::new();
    let mut arms = Vec::new();
    let mut i = 0;
    while i < t.len() {
        if isp(t.get(i), "(") {
            if let (Some(Tok::Str(k)), true) = (t.get(i + 1), isp(t.get(i + 2), ",")) {
                match val(t, i + 3)? {
                    None => return er("no value"),
                    Some((v, nx)) => {
                        if isp(t.get(nx), ")") { tuples.push((k.clone(), v)); i = nx + 1; } else { i += 1; }
                        continue;
                    }
                }
            }
        }
        if let Some(Tok::Str(k)) = t.get(i) {
            if isp(t.get(i + 1), "|") && matches!(t.get(i + 2), Some(Tok::Str(_))) { return er("or-pattern"); }
            if isp(t.get(i + 1), "=>") {
                match val(t, i + 2)? {
                    Some((v, nx)) if isp(t.get(nx), ",") || isp(t.get(nx), "}") => { arms.push((k.clone(), v)); i = nx; continue; }
                    _ => return er("bad arm"),
                }
            }
        }
        i += 1;
    }
    Ok(if tuples.is_empty() { arms } else { tuples })
}

#[derive(Clone, Debug)]
enum Ty { Text, Bytes, Bool, Nil, I64, U64, F64, Json, Tuple(Vec<Ty>), List(Box<Ty>), Map(Box<Ty>, Box<Ty>), Rec(Vec<(String, Ty)>), Union(Vec<Ty>) }

fn same(a: &Ty, b: &Ty) -> bool {
    use Ty::*;
    match (a, b) {
        (Text, Text) | (Bytes, Bytes) | (Bool, Bool) | (Nil, Nil) | (I64, I64) | (U64, U64) | (F64, F64) | (Json, Json) => true,
        (Tuple(x), Tuple(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q)),
        (List(x), List(y)) => same(x, y),
        (Map(a1, a2), Map(b1, b2)) => same(a1, b1) && same(a2, b2),
        (Rec(x), Rec(y)) => x.len() == y.len() && x.iter().all(|(n, t)| y.iter().any(|(m, u)| n == m && same(t, u))),
        (Union(x), Union(y)) => x.iter().all(|p| y.iter().any(|q| same(p, q))) && y.iter().all(|p| x.iter().any(|q| same(p, q))),
        _ => false,
    }
}

fn acc(b: &Ty) -> bool {
    use Ty::*;
    match b {
        Nil | Bool | F64 | Text | Json => true,
        List(x) => acc(x),
        Tuple(x) => x.iter().all(acc),
        Map(k, v) => matches!(**k, Text) && acc(v),
        Rec(f) => f.iter().all(|(_, t)| acc(t)),
        Union(x) => x.iter().all(acc),
        _ => false,
    }
}

fn covers(a: &Ty, b: &Ty) -> bool {
    use Ty::*;
    if same(a, b) || (matches!(a, Json) && acc(b)) { return true; }
    match (a, b) {
        (List(x), List(y)) if covers(x, y) => return true,
        (Tuple(x), Tuple(y)) if x.len() == y.len() && x.iter().zip(y).all(|(p, q)| covers(p, q)) => return true,
        (Map(k1, v1), Map(k2, v2)) if covers(k1, k2) && covers(v1, v2) => return true,
        (Rec(x), Rec(y)) if x.iter().all(|(n, t)| y.iter().any(|(m, u)| n == m && covers(t, u))) => return true,
        _ => {}
    }
    if let Union(x) = a { if x.iter().any(|p| covers(p, b)) { return true; } }
    if let Union(y) = b { if y.iter().all(|q| covers(a, q)) { return true; } }
    false
}

enum S { W(String), P(char) }
struct Ps { t: Vec<S>, i: usize }

impl Ps {
    fn peek(&self, c: char) -> bool { matches!(self.t.get(self.i), Some(S::P(x)) if *x == c) }
    fn punct(&mut self, c: char) -> R<()> { if self.peek(c) { self.i += 1; Ok(()) } else { er("expected punct") } }
    fn ty(&mut self, d: usize) -> R<Ty> {
        let mut alts = vec![self.alt(d)?];
        while self.peek('|') { self.i += 1; alts.push(self.alt(d)?); }
        if alts.len() == 1 { return Ok(alts.pop().unwrap()); }
        for j in 1..alts.len() { for i in 0..j { if covers(&alts[i], &alts[j]) { return er("covered alternative"); } } }
        Ok(Ty::Union(alts))
    }
    fn alt(&mut self, d: usize) -> R<Ty> {
        let w = match self.t.get(self.i) { Some(S::W(w)) => w.clone(), _ => return er("expected word") };
        self.i += 1;
        let base = match w.as_str() {
            "text" => Some(Ty::Text), "bytes" => Some(Ty::Bytes), "bool" => Some(Ty::Bool), "none" => Some(Ty::Nil),
            "i64" => Some(Ty::I64), "u64" => Some(Ty::U64), "f64" => Some(Ty::F64), "json" => Some(Ty::Json),
            _ => None,
        };
        if let Some(b) = base { return Ok(b); }
        if !matches!(w.as_str(), "tuple" | "list" | "map" | "record") { return er("unknown type"); }
        if d + 1 > 16 { return er("too deep"); }
        let nd = d + 1;
        self.punct('[')?;
        let r = match w.as_str() {
            "list" => Ty::List(Box::new(self.ty(nd)?)),
            "map" => { let k = self.ty(nd)?; self.punct(',')?; Ty::Map(Box::new(k), Box::new(self.ty(nd)?)) }
            "tuple" => {
                let mut v = vec![self.ty(nd)?];
                while self.peek(',') { self.i += 1; v.push(self.ty(nd)?); }
                Ty::Tuple(v)
            }
            _ => {
                let mut v: Vec<(String, Ty)> = Vec::new();
                loop {
                    let n = match self.t.get(self.i) {
                        Some(S::W(n)) if !n.starts_with(|c: char| c.is_ascii_digit()) => n.clone(),
                        _ => return er("bad field name"),
                    };
                    self.i += 1;
                    self.punct(':')?;
                    let ty = self.ty(nd)?;
                    if v.iter().any(|(m, _)| *m == n) { return er("duplicate field"); }
                    v.push((n, ty));
                    if self.peek(',') { self.i += 1; } else { break; }
                }
                Ty::Rec(v)
            }
        };
        self.punct(']')?;
        Ok(r)
    }
}

fn isws(c: char) -> bool { matches!(c, ' ' | '\t' | '\r' | '\n') }

fn norm(s: &str) -> String {
    let t = s.trim_matches(isws);
    let ch: Vec<char> = t.chars().collect();
    let n = ch.len();
    if n > 3 && ch[0] == 'm' && ch[1] == 'a' && ch[2] == 'p' && isws(ch[3]) {
        let mut s0 = 3;
        while s0 < n && isws(ch[s0]) { s0 += 1; }
        let mut kl = 1;
        while s0 + kl < n {
            let mut q = s0 + kl;
            while q < n && isws(ch[q]) { q += 1; }
            if q + 1 < n && ch[q] == '-' && ch[q + 1] == '>' {
                let mut v = q + 2;
                while v < n && isws(ch[v]) { v += 1; }
                if v < n {
                    let k: String = ch[s0..s0 + kl].iter().collect();
                    let vv: String = ch[v..].iter().collect();
                    return format!("map[{}, {}]", norm(&k), norm(&vv));
                }
            }
            kl += 1;
        }
    }
    t.to_string()
}

fn widen(s: &str) -> String {
    let ch: Vec<char> = s.chars().collect();
    let n = ch.len();
    let mut o = String::new();
    let mut i = 0;
    while i < n {
        let mut done = false;
        for (w, r) in [("u8", "u64"), ("u16", "u64"), ("u32", "u64"), ("i8", "i64"), ("i16", "i64"), ("i32", "i64")] {
            let wc: Vec<char> = w.chars().collect();
            if i + wc.len() <= n && ch[i..i + wc.len()] == wc[..] {
                let mut b = i;
                while b > 0 && isws(ch[b - 1]) { b -= 1; }
                let mut a = i + wc.len();
                while a < n && isws(ch[a]) { a += 1; }
                if (b == 0 || "[,|:".contains(ch[b - 1])) && (a >= n || "],|".contains(ch[a])) {
                    o.push_str(r);
                    i += wc.len();
                    done = true;
                    break;
                }
            }
        }
        if !done { o.push(ch[i]); i += 1; }
    }
    o
}

fn parse_shape(shape: &str) -> R<Ty> {
    let cut = shape.split(';').next().unwrap_or("");
    let text = widen(&norm(cut));
    let mut toks = Vec::new();
    let ch: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < ch.len() {
        let c = ch[i];
        if isws(c) { i += 1; }
        else if c.is_ascii_alphanumeric() || c == '_' {
            let mut k = i;
            while k < ch.len() && (ch[k].is_ascii_alphanumeric() || ch[k] == '_') { k += 1; }
            toks.push(S::W(ch[i..k].iter().collect()));
            i = k;
        } else if "[],|:".contains(c) { toks.push(S::P(c)); i += 1; }
        else { return er("bad shape char"); }
    }
    let mut p = Ps { t: toks, i: 0 };
    let ty = p.ty(0)?;
    if p.i != p.t.len() { return er("trailing shape"); }
    Ok(ty)
}

fn fit(v: &V, t: &Ty) -> bool {
    match t {
        Ty::Text => matches!(v, V::T(_)),
        Ty::Bool => matches!(v, V::B(_)),
        Ty::Nil => matches!(v, V::N0),
        Ty::F64 => matches!(v, V::F(_)),
        Ty::I64 => matches!(v, V::F(x) if x.fract() == 0.0 && *x >= -9223372036854775808.0 && *x < 9223372036854775808.0),
        Ty::U64 => matches!(v, V::F(x) if x.fract() == 0.0 && *x >= 0.0 && *x < 18446744073709551616.0),
        Ty::Json => true,
        Ty::List(i) => matches!(v, V::L(xs) if xs.iter().all(|x| fit(x, i))),
        Ty::Tuple(ts) => matches!(v, V::L(xs) if xs.len() == ts.len() && xs.iter().zip(ts).all(|(x, t)| fit(x, t))),
        Ty::Union(ts) => ts.iter().any(|t| fit(v, t)),
        _ => false,
    }
}

fn deq(a: &V, b: &V) -> bool {
    match (a, b) {
        (V::L(x), V::L(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| deq(p, q)),
        (V::T(x), V::T(y)) => x == y,
        (V::B(x), V::B(y)) => x == y,
        (V::N0, V::N0) => true,
        (V::F(x), V::F(y)) => x == y,
        _ => false,
    }
}

fn same_val(a: &V, b: &V) -> bool {
    match (a, b) {
        (V::L(_), V::L(_)) => deq(a, b),
        (V::F(x), V::F(y)) => x.to_bits() == y.to_bits(),
        (V::L(_), _) | (_, V::L(_)) => false,
        _ => deq(a, b),
    }
}

fn to_json(v: &V) -> R<Value> {
    Ok(match v {
        V::T(s) => Value::String(s.clone()),
        V::B(b) => Value::Bool(*b),
        V::N0 => Value::Null,
        V::F(x) => Value::Number(serde_json::Number::from_f64(*x).ok_or_else(|| "non-finite".to_string())?),
        V::L(xs) => Value::Array(xs.iter().map(to_json).collect::<R<Vec<_>>>()?),
    })
}

pub fn rust_carried_table(src: &str, shape: Option<&str>) -> Result<serde_json::Value, String> {
    let chars: Vec<char> = src.chars().collect();
    let toks = lex(&chars)?;
    let entries = scan(&toks)?;
    if entries.is_empty() { return er("no entries"); }
    if let Some(s) = shape {
        if !s.is_empty() {
            match parse_shape(s)? {
                Ty::Map(kt, vt) => {
                    for (k, v) in &entries {
                        if !fit(&V::T(k.clone()), &kt) || !fit(v, &vt) { return er("shape misfit"); }
                    }
                }
                _ => return er("not a map type"),
            }
        }
    }
    let mut res: HashMap<String, V> = HashMap::new();
    for (k, v) in entries {
        if let Some(old) = res.get(&k) { if !same_val(old, &v) { return er("duplicate key"); } }
        res.insert(k, v);
    }
    let mut m = serde_json::Map::new();
    for (k, v) in &res { m.insert(k.clone(), to_json(v)?); }
    Ok(Value::Object(m))
}
