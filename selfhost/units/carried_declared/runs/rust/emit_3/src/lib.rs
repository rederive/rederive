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
    let cs: Vec<char> = t.chars().collect();
    let mut i = 0;
    while i < cs.len() {
        let c = cs[i];
        if c == '\r' || c == '\n' {
            if c == '\r' && i + 1 < cs.len() && cs[i + 1] == '\n' {
                i += 1;
            }
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
        i += 1;
    }
    out.push(cur);
    out
}

fn spans(c: &[char]) -> Vec<(usize, usize)> {
    let mut res: Vec<(usize, usize)> = Vec::new();
    let mut i = 0;
    while i < c.len() {
        if c[i] == '"' {
            let opens = i == 0
                || " \t([{,=:;|<>!&-~".contains(c[i - 1])
                || res.last().map_or(false, |&(_, e)| e + 1 == i);
            if opens {
                let mut j = i + 1;
                let mut closed = None;
                while j < c.len() {
                    if c[j] == '\\' {
                        j += 2;
                    } else if c[j] == '"' {
                        closed = Some(j);
                        break;
                    } else {
                        j += 1;
                    }
                }
                match closed {
                    Some(e) => {
                        res.push((i, e));
                        i = e + 1;
                        continue;
                    }
                    None => break,
                }
            }
        }
        i += 1;
    }
    res
}

fn inside(sp_: &[(usize, usize)], k: usize) -> bool {
    sp_.iter().any(|&(o, e)| o < k && k < e)
}

fn cut_attr(s: &[char]) -> String {
    let spn = spans(s);
    let n = s.len();
    let mut end = n;
    'o: for k in 1..n {
        if !sp(s[k - 1]) || inside(&spn, k) {
            continue;
        }
        for w in ["CITED", "EARNED", "ANCHOR"] {
            let wc: Vec<char> = w.chars().collect();
            if s[k..].starts_with(&wc) && (k + wc.len() == n || sp(s[k + wc.len()])) {
                end = k;
                break 'o;
            }
        }
    }
    trim_sp(&s[..end]).iter().collect()
}

fn code_of(content: &[char]) -> Vec<char> {
    let spn = spans(content);
    let n = content.len();
    let mut end = n;
    for k in 1..n {
        if content[k] == '#' && sp(content[k - 1]) && (k + 1 == n || sp(content[k + 1])) && !inside(&spn, k) {
            end = k;
            break;
        }
    }
    let mut v = content[..end].to_vec();
    while v.last().map_or(false, |&c| sp(c)) {
        v.pop();
    }
    v
}

fn valid_name(t: &[char]) -> bool {
    !t.is_empty()
        && t[0].is_ascii_uppercase()
        && t.iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

fn in_ranges(c: u32, r: &[(u32, u32)]) -> bool {
    r.iter().any(|&(a, b)| a <= c && c <= b)
}

fn invisible(ch: char) -> bool {
    let c = ch as u32;
    const R: &[(u32, u32)] = &[
        (0x9, 0xD), (0x20, 0x20), (0xA0, 0xA0), (0x1680, 0x1680), (0x2000, 0x200A), (0x2028, 0x2029),
        (0x202F, 0x202F), (0x205F, 0x205F), (0x3000, 0x3000), (0xFEFF, 0xFEFF),
        (0xAD, 0xAD), (0x600, 0x605), (0x61C, 0x61C), (0x6DD, 0x6DD), (0x70F, 0x70F), (0x890, 0x891),
        (0x8E2, 0x8E2), (0x180E, 0x180E), (0x200B, 0x200F), (0x202A, 0x202E), (0x2060, 0x2064),
        (0x2066, 0x206F), (0xFFF9, 0xFFFB), (0x110BD, 0x110BD), (0x110CD, 0x110CD),
        (0x13430, 0x1343F), (0x1BCA0, 0x1BCA3), (0x1D173, 0x1D17A), (0xE0001, 0xE0001),
        (0xE0020, 0xE007F),
    ];
    in_ranges(c, R)
}

fn rebuild(v: &Value) -> Value {
    match v {
        Value::Number(n) => Value::from(n.as_f64().unwrap_or(0.0)),
        Value::Array(a) => Value::Array(a.iter().map(rebuild).collect()),
        Value::Object(m) => {
            let mut o = serde_json::Map::new();
            for (k, x) in m {
                o.insert(k.clone(), rebuild(x));
            }
            Value::Object(o)
        }
        o => o.clone(),
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
            let ds = i;
            while i < n && e[i].is_ascii_digit() {
                i += 1;
            }
            let int_end = i;
            let mut simple = true;
            if i < n && e[i] == '.' {
                simple = false;
                i += 1;
                while i < n && e[i].is_ascii_digit() {
                    i += 1;
                }
            }
            let mant_end = i;
            if i < n && (e[i] == 'e' || e[i] == 'E') {
                simple = false;
                i += 1;
                if i < n && (e[i] == '+' || e[i] == '-') {
                    i += 1;
                }
                while i < n && e[i].is_ascii_digit() {
                    i += 1;
                }
            }
            let s: String = e[st..i].iter().collect();
            let x: f64 = s.parse().map_err(|_| "num".to_string())?;
            if !x.is_finite() || x.abs() > 9007199254740992.0 {
                return Err("range".into());
            }
            if x == 0.0 && e[st..mant_end].iter().any(|c| ('1'..='9').contains(c)) {
                return Err("underflow".into());
            }
            if simple {
                let digits: String = e[ds..int_end].iter().collect();
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

fn authority(v: &str) -> Result<(String, Value), String> {
    let c: Vec<char> = v.chars().collect();
    let n = c.len();
    let skip = |mut i: usize| {
        while i < n && sp(c[i]) {
            i += 1;
        }
        i
    };
    let lit = |i: usize, w: &str| -> Option<usize> {
        let wc: Vec<char> = w.chars().collect();
        if c[i..].starts_with(&wc) { Some(i + wc.len()) } else { None }
    };
    let bad = || "AUTHORITY malformed".to_string();
    if n == 0 || c[0] != '{' {
        return Err(bad());
    }
    let mut i = skip(1);
    i = skip(lit(i, "expr:").ok_or_else(bad)?);
    if i >= n || c[i] != '"' {
        return Err(bad());
    }
    let ss = i;
    i += 1;
    loop {
        if i >= n {
            return Err(bad());
        }
        if c[i] == '\\' {
            if i + 1 >= n {
                return Err(bad());
            }
            i += 2;
        } else if c[i] == '"' {
            i += 1;
            break;
        } else {
            i += 1;
        }
    }
    let sstr: String = c[ss..i].iter().collect();
    i = skip(i);
    if i >= n || c[i] != ',' {
        return Err(bad());
    }
    i = skip(i + 1);
    i = skip(lit(i, "equals:").ok_or_else(bad)?);
    if i >= n || c[n - 1] != '}' {
        return Err(bad());
    }
    let mut e: &[char] = &c[i..n - 1];
    while e.last().map_or(false, |&x| sp(x)) {
        e = &e[..e.len() - 1];
    }
    let expr: String = serde_json::from_str::<String>(&sstr).map_err(|e| e.to_string())?;
    let estr: String = e.iter().collect();
    let val: Value = serde_json::from_str::<Value>(&estr).map_err(|e| e.to_string())?;
    check_numerals(e)?;
    if expr.chars().all(invisible) {
        return Err("expr invisible".into());
    }
    Ok((expr, rebuild(&val)))
}

pub fn carried_declared(text: &str) -> Result<Option<Rec>, String> {
    // (name, args, continuation bodies)
    let mut dirs: Vec<(String, String, Vec<String>)> = Vec::new();
    for line in split_lines(text) {
        let mut ind: Vec<char> = Vec::new();
        let mut k = 0;
        while k < line.len() && (sp(line[k]) || line[k] == '\u{FEFF}') {
            if sp(line[k]) {
                ind.push(line[k]);
            }
            k += 1;
        }
        let mut content: Vec<char> = line[k..].to_vec();
        while content.last().map_or(false, |&c| sp(c)) {
            content.pop();
        }
        if content.is_empty() || content[0] == '#' {
            continue;
        }
        let code = code_of(&content);
        if ind.is_empty() {
            let tend = code.iter().position(|&c| sp(c)).unwrap_or(code.len());
            let mut tok = &code[..tend];
            if tok.last() == Some(&':') {
                tok = &tok[..tok.len() - 1];
            }
            if valid_name(tok) && tok != ['C', 'I', 'T', 'E', 'D'] {
                let args = cut_attr(&code[tend..]);
                dirs.push((tok.iter().collect(), args, Vec::new()));
                continue;
            }
        }
        if let Some(d) = dirs.last_mut() {
            let mut s = vec![' '];
            s.extend_from_slice(&code);
            let body = cut_attr(&s);
            if !body.is_empty() {
                d.2.push(body);
            }
        }
    }
    let carried: Vec<&(String, String, Vec<String>)> = dirs.iter().filter(|d| d.0 == "CARRIED").collect();
    if carried.is_empty() {
        return Ok(None);
    }
    if carried.len() > 1 {
        return Err("one CARRIED per primary".into());
    }
    if dirs.iter().any(|d| d.0 == "CANONICAL-SHA256" || d.0 == "SHAPE" || d.0 == "AUTHORITY") {
        return Err("sub-field not indented".into());
    }
    let (_, args, bodies) = carried[0];
    let a: Vec<char> = args.chars().collect();
    let head = || "CARRIED head malformed".to_string();
    if a.is_empty() || !(a[0].is_ascii_alphabetic() || a[0] == '_') {
        return Err(head());
    }
    let mut i = 0;
    while i < a.len() && (a[i].is_ascii_alphanumeric() || a[i] == '_') {
        i += 1;
    }
    let name: String = a[..i].iter().collect();
    let s1 = i;
    while i < a.len() && sp(a[i]) {
        i += 1;
    }
    if i == s1 || !a[i..].starts_with(&['F', 'R', 'O', 'M']) {
        return Err(head());
    }
    i += 4;
    let s2 = i;
    while i < a.len() && sp(a[i]) {
        i += 1;
    }
    if i == s2 || i >= a.len() || a[i..].iter().any(|&c| c == '\u{2028}' || c == '\u{2029}') {
        return Err(head());
    }
    let from: String = a[i..].iter().collect();

    let mut sha: Option<String> = None;
    let mut shape: Option<String> = None;
    let mut asserts: Vec<(String, Value)> = Vec::new();
    for b in bodies {
        for kw in ["CANONICAL-SHA256", "SHAPE", "AUTHORITY"] {
            let Some(rest) = b.strip_prefix(kw) else { continue };
            if let Some(c) = rest.chars().next() {
                if c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-' {
                    continue;
                }
            }
            let value: String = if rest.is_empty() {
                String::new()
            } else if rest.starts_with(|c| sp(c)) {
                rest.trim_start_matches(|c| sp(c)).to_string()
            } else {
                return Err("bad keyword line".into());
            };
            match kw {
                "CANONICAL-SHA256" => {
                    if sha.is_some() {
                        return Err("repeated sha".into());
                    }
                    if value.chars().count() != 64 || !value.chars().all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c)) {
                        return Err("bad sha".into());
                    }
                    sha = Some(value);
                }
                "SHAPE" => {
                    if shape.is_some() || value.is_empty() {
                        return Err("bad shape".into());
                    }
                    shape = Some(value);
                }
                _ => asserts.push(authority(&value)?),
            }
            break;
        }
    }
    Ok(Some((name, from, sha, shape, asserts)))
}
