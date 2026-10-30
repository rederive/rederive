use serde_json::Value;

type Rec = (String, String, Option<String>, Option<String>, Vec<(String, Value)>);

fn sp(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn trim_sp(s: &[char]) -> &[char] {
    let mut a = 0;
    let mut b = s.len();
    while a < b && sp(s[a]) {
        a += 1;
    }
    while b > a && sp(s[b - 1]) {
        b -= 1;
    }
    &s[a..b]
}

fn split_lines(t: &str) -> Vec<Vec<char>> {
    let mut out = Vec::new();
    let mut cur = Vec::new();
    let mut it = t.chars().peekable();
    while let Some(c) = it.next() {
        if c == '\r' {
            if it.peek() == Some(&'\n') {
                it.next();
            }
            out.push(std::mem::take(&mut cur));
        } else if c == '\n' {
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
    }
    out.push(cur);
    out
}

fn quoted_spans(s: &[char]) -> Vec<(usize, usize)> {
    let n = s.len();
    let mut spans = Vec::new();
    let mut prev_close: Option<usize> = None;
    let mut i = 0;
    while i < n {
        let opens = s[i] == '"'
            && (i == 0
                || " \t([{,=:;|<>!&-~".contains(s[i - 1])
                || prev_close == Some(i - 1));
        if opens {
            let mut j = i + 1;
            let mut found = false;
            while j < n {
                if s[j] == '\\' {
                    j += 2;
                } else if s[j] == '"' {
                    found = true;
                    break;
                } else {
                    j += 1;
                }
            }
            if !found {
                break;
            }
            spans.push((i, j));
            prev_close = Some(j);
            i = j + 1;
        } else {
            i += 1;
        }
    }
    spans
}

fn inside(spans: &[(usize, usize)], i: usize) -> bool {
    spans.iter().any(|&(a, b)| a < i && i < b)
}

fn cut_comment(content: &[char]) -> Vec<char> {
    let spans = quoted_spans(content);
    let n = content.len();
    for i in 1..n {
        if content[i] == '#'
            && sp(content[i - 1])
            && (i + 1 == n || sp(content[i + 1]))
            && !inside(&spans, i)
        {
            return trim_sp(&content[..i]).to_vec();
        }
    }
    content.to_vec()
}

fn strip_attrs(text: &[char]) -> Vec<char> {
    let spans = quoted_spans(text);
    let n = text.len();
    for i in 1..n {
        if !sp(text[i - 1]) {
            continue;
        }
        for w in ["CITED", "EARNED", "ANCHOR"] {
            let wc: Vec<char> = w.chars().collect();
            let e = i + wc.len();
            if e <= n && text[i..e] == wc[..] && (e == n || sp(text[e])) && !inside(&spans, i) {
                return trim_sp(&text[..i]).to_vec();
            }
        }
    }
    trim_sp(text).to_vec()
}

fn is_name(t: &[char]) -> bool {
    !t.is_empty()
        && t[0].is_ascii_uppercase()
        && t.iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

struct Dir {
    name: String,
    args: Vec<char>,
    conts: Vec<Vec<char>>,
}

fn invisible(c: char) -> bool {
    let u = c as u32;
    matches!(u, 0x09..=0x0D | 0x20 | 0xA0 | 0x1680 | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF)
        || matches!(u,
            0xAD | 0x600..=0x605 | 0x61C | 0x6DD | 0x70F | 0x890 | 0x891 | 0x8E2 | 0x180E
            | 0x200B..=0x200F | 0x202A..=0x202E | 0x2060..=0x2064 | 0x2066..=0x206F
            | 0xFFF9..=0xFFFB | 0x110BD | 0x110CD | 0x13430..=0x1343F | 0x1BCA0..=0x1BCA3
            | 0x1D173..=0x1D17A | 0xE0001 | 0xE0020..=0xE007F)
}

fn rebuild(v: Value) -> Value {
    match v {
        Value::Number(n) => n
            .as_f64()
            .and_then(serde_json::Number::from_f64)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        Value::Array(a) => Value::Array(a.into_iter().map(rebuild).collect()),
        Value::Object(m) => Value::Object(m.into_iter().map(|(k, v)| (k, rebuild(v))).collect()),
        o => o,
    }
}

fn check_numerals(e: &[char]) -> Result<(), String> {
    let n = e.len();
    let mut i = 0;
    while i < n {
        let c = e[i];
        if c == '"' {
            i += 1;
            while i < n && e[i] != '"' {
                if e[i] == '\\' {
                    i += 1;
                }
                i += 1;
            }
            i += 1;
        } else if c == '-' || c.is_ascii_digit() {
            let st = i;
            if e[i] == '-' {
                i += 1;
            }
            while i < n && e[i].is_ascii_digit() {
                i += 1;
            }
            let mut int_form = true;
            if i < n && e[i] == '.' {
                int_form = false;
                i += 1;
                while i < n && e[i].is_ascii_digit() {
                    i += 1;
                }
            }
            let mant_end = i;
            if i < n && (e[i] == 'e' || e[i] == 'E') {
                int_form = false;
                i += 1;
                if i < n && (e[i] == '+' || e[i] == '-') {
                    i += 1;
                }
                while i < n && e[i].is_ascii_digit() {
                    i += 1;
                }
            }
            let txt: String = e[st..i].iter().collect();
            let x: f64 = txt.parse().map_err(|_| "num".to_string())?;
            if !x.is_finite() || x.abs() > 9007199254740992.0 {
                return Err("num range".into());
            }
            if x == 0.0 && e[st..mant_end].iter().any(|c| ('1'..='9').contains(c)) {
                return Err("underflow".into());
            }
            if int_form {
                let digits: String = e[st..i].iter().filter(|c| c.is_ascii_digit()).collect();
                if digits != (x.abs() as u64).to_string() {
                    return Err("inexact".into());
                }
            }
        } else {
            i += 1;
        }
    }
    Ok(())
}

fn parse_authority(v: &[char]) -> Result<(String, Value), String> {
    let bad = || "AUTHORITY form".to_string();
    let n = v.len();
    let mut p = 0;
    let skip = |p: &mut usize| {
        while *p < n && sp(v[*p]) {
            *p += 1;
        }
    };
    let lit = |p: &mut usize, s: &str| -> bool {
        let c: Vec<char> = s.chars().collect();
        if *p + c.len() <= n && v[*p..*p + c.len()] == c[..] {
            *p += c.len();
            true
        } else {
            false
        }
    };
    if !lit(&mut p, "{") {
        return Err(bad());
    }
    skip(&mut p);
    if !lit(&mut p, "expr:") {
        return Err(bad());
    }
    skip(&mut p);
    if p >= n || v[p] != '"' {
        return Err(bad());
    }
    let s0 = p;
    p += 1;
    loop {
        if p >= n {
            return Err(bad());
        }
        if v[p] == '\\' {
            if p + 1 >= n {
                return Err(bad());
            }
            p += 2;
        } else if v[p] == '"' {
            break;
        } else {
            p += 1;
        }
    }
    p += 1;
    let lit_str: String = v[s0..p].iter().collect();
    skip(&mut p);
    if !lit(&mut p, ",") {
        return Err(bad());
    }
    skip(&mut p);
    if !lit(&mut p, "equals:") {
        return Err(bad());
    }
    skip(&mut p);
    if p >= n || v[n - 1] != '}' || p > n - 1 {
        return Err(bad());
    }
    let e = trim_sp(&v[p..n - 1]);
    let expr: String = serde_json::from_str::<String>(&lit_str).map_err(|e| e.to_string())?;
    let es: String = e.iter().collect();
    let val: Value = serde_json::from_str::<Value>(&es).map_err(|e| e.to_string())?;
    check_numerals(e)?;
    if expr.chars().all(invisible) {
        return Err("expr invisible".into());
    }
    Ok((expr, rebuild(val)))
}

pub fn carried_declared(text: &str) -> Result<Option<Rec>, String> {
    let mut dirs: Vec<Dir> = Vec::new();
    for line in split_lines(text) {
        let mut i = 0;
        let mut indent = String::new();
        while i < line.len() && (sp(line[i]) || line[i] == '\u{FEFF}') {
            if sp(line[i]) {
                indent.push(line[i]);
            }
            i += 1;
        }
        let content = trim_sp(&line[i..]);
        if content.is_empty() || content[0] == '#' {
            continue;
        }
        let code = cut_comment(content);
        let mut started = false;
        if indent.is_empty() {
            let tl = code.iter().position(|&c| sp(c)).unwrap_or(code.len());
            let mut tok = &code[..tl];
            if tok.last() == Some(&':') {
                tok = &tok[..tok.len() - 1];
            }
            if is_name(tok) && tok != ['C', 'I', 'T', 'E', 'D'] {
                let mut t = vec![' '];
                t.extend_from_slice(&code[tl..]);
                let rest = if code[..tl].last() == Some(&':') { code[tl..].to_vec() } else { code[tl..].to_vec() };
                let _ = t;
                dirs.push(Dir {
                    name: tok.iter().collect(),
                    args: strip_attrs(&rest),
                    conts: Vec::new(),
                });
                started = true;
            }
        }
        if !started {
            if let Some(d) = dirs.last_mut() {
                let mut t = vec![' '];
                t.extend_from_slice(&code);
                let body = strip_attrs(&t);
                if !body.is_empty() {
                    d.conts.push(body);
                }
            }
        }
    }
    let carried: Vec<&Dir> = dirs.iter().filter(|d| d.name == "CARRIED").collect();
    if carried.is_empty() {
        return Ok(None);
    }
    if carried.len() > 1 {
        return Err("two CARRIED".into());
    }
    if dirs
        .iter()
        .any(|d| matches!(d.name.as_str(), "CANONICAL-SHA256" | "SHAPE" | "AUTHORITY"))
    {
        return Err("sub-field at column 0".into());
    }
    let d = carried[0];
    let a = &d.args;
    let head_err = || "CARRIED head".to_string();
    let mut p = 0;
    if p >= a.len() || !(a[p].is_ascii_alphabetic() || a[p] == '_') {
        return Err(head_err());
    }
    while p < a.len() && (a[p].is_ascii_alphanumeric() || a[p] == '_') {
        p += 1;
    }
    let name: String = a[..p].iter().collect();
    let q = p;
    while p < a.len() && sp(a[p]) {
        p += 1;
    }
    if p == q || p + 4 > a.len() || a[p..p + 4] != ['F', 'R', 'O', 'M'] {
        return Err(head_err());
    }
    p += 4;
    let q = p;
    while p < a.len() && sp(a[p]) {
        p += 1;
    }
    if p == q || p >= a.len() || a[p..].iter().any(|&c| c == '\u{2028}' || c == '\u{2029}') {
        return Err(head_err());
    }
    let from: String = a[p..].iter().collect();

    let mut sha: Option<String> = None;
    let mut shape: Option<String> = None;
    let mut asserts: Vec<(String, Value)> = Vec::new();
    for b in &d.conts {
        for kw in ["CANONICAL-SHA256", "SHAPE", "AUTHORITY"] {
            let k: Vec<char> = kw.chars().collect();
            if b.len() < k.len() || b[..k.len()] != k[..] {
                continue;
            }
            if let Some(&c) = b.get(k.len()) {
                if c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-' {
                    continue;
                }
            }
            let value: Vec<char> = if b.len() == k.len() {
                Vec::new()
            } else if sp(b[k.len()]) {
                let mut r = k.len();
                while r < b.len() && sp(b[r]) {
                    r += 1;
                }
                b[r..].to_vec()
            } else {
                return Err("bad keyword line".into());
            };
            match kw {
                "CANONICAL-SHA256" => {
                    if sha.is_some() {
                        return Err("dup sha".into());
                    }
                    if value.len() != 64 || !value.iter().all(|c| c.is_ascii_digit() || ('a'..='f').contains(c)) {
                        return Err("bad sha".into());
                    }
                    sha = Some(value.iter().collect());
                }
                "SHAPE" => {
                    if shape.is_some() {
                        return Err("dup shape".into());
                    }
                    if value.is_empty() {
                        return Err("empty shape".into());
                    }
                    shape = Some(value.iter().collect());
                }
                _ => asserts.push(parse_authority(&value)?),
            }
            break;
        }
    }
    Ok(Some((name, from, sha, shape, asserts)))
}
