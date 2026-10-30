use serde_json::Value;

type Rec = (String, String, Option<String>, Option<String>, Vec<(String, Value)>);

fn sp(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let mut out = Vec::new();
    let mut cur: Vec<char> = Vec::new();
    let mut it = text.chars().peekable();
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

fn spans(c: &[char]) -> Vec<(usize, usize)> {
    let mut res: Vec<(usize, usize)> = Vec::new();
    let opener = " \t([{,=:;|<>!&-~";
    let mut i = 0;
    while i < c.len() {
        if c[i] == '"' {
            let after_span = res.last().map_or(false, |&(_, cl)| cl + 1 == i);
            if i == 0 || opener.contains(c[i - 1]) || after_span {
                let mut j = i + 1;
                let mut close = None;
                while j < c.len() {
                    if c[j] == '\\' {
                        j += 2;
                    } else if c[j] == '"' {
                        close = Some(j);
                        break;
                    } else {
                        j += 1;
                    }
                }
                match close {
                    Some(cl) => {
                        res.push((i, cl));
                        i = cl + 1;
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

fn inside(sp_: &[(usize, usize)], p: usize) -> bool {
    sp_.iter().any(|&(o, c)| o < p && p < c)
}

fn trim_sp(c: &[char]) -> Vec<char> {
    let mut s = 0;
    let mut e = c.len();
    while s < e && sp(c[s]) {
        s += 1;
    }
    while e > s && sp(c[e - 1]) {
        e -= 1;
    }
    c[s..e].to_vec()
}

fn starts(c: &[char], p: usize, w: &str) -> bool {
    let w: Vec<char> = w.chars().collect();
    c.len() >= p + w.len() && c[p..p + w.len()] == w[..]
}

fn attr_cut(text: &[char]) -> Vec<char> {
    let sps = spans(text);
    for p in 1..text.len() {
        if !sp(text[p - 1]) {
            continue;
        }
        for w in ["CITED", "EARNED", "ANCHOR"] {
            if starts(text, p, w) {
                let n = w.len();
                if (p + n == text.len() || sp(text[p + n])) && !inside(&sps, p) {
                    return trim_sp(&text[..p]);
                }
            }
        }
    }
    trim_sp(text)
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

fn parse_dirs(text: &str) -> Vec<Dir> {
    let mut dirs: Vec<Dir> = Vec::new();
    for line in split_lines(text) {
        let mut k = 0;
        while k < line.len() && (sp(line[k]) || line[k] == '\u{FEFF}') {
            k += 1;
        }
        let mut l: Vec<char> = line[..k].iter().copied().filter(|c| *c != '\u{FEFF}').collect();
        l.extend_from_slice(&line[k..]);
        while l.last().map_or(false, |c| sp(*c)) {
            l.pop();
        }
        let ind = l.iter().take_while(|c| sp(**c)).count();
        let content = &l[ind..];
        if content.is_empty() || content[0] == '#' {
            continue;
        }
        let sps = spans(content);
        let mut cut = content.len();
        for p in 1..content.len() {
            if content[p] == '#'
                && sp(content[p - 1])
                && (p + 1 == content.len() || sp(content[p + 1]))
                && !inside(&sps, p)
            {
                cut = p;
                break;
            }
        }
        let mut code = content[..cut].to_vec();
        while code.last().map_or(false, |c| sp(*c)) {
            code.pop();
        }
        let mut started = false;
        if ind == 0 {
            let tl = code.iter().take_while(|c| !sp(**c)).count();
            let mut t = &code[..tl];
            if t.last() == Some(&':') {
                t = &t[..t.len() - 1];
            }
            if is_name(t) && t.iter().collect::<String>() != "CITED" {
                dirs.push(Dir {
                    name: t.iter().collect(),
                    args: attr_cut(&code[tl..]),
                    conts: Vec::new(),
                });
                started = true;
            }
        }
        if !started {
            if let Some(d) = dirs.last_mut() {
                let mut pre = vec![' '];
                pre.extend_from_slice(&code);
                let b = attr_cut(&pre);
                if !b.is_empty() {
                    d.conts.push(b);
                }
            }
        }
    }
    dirs
}

fn parse_head(a: &[char]) -> Result<(String, String), String> {
    let err = || "bad CARRIED head".to_string();
    let mut i = 0;
    if a.is_empty() || !(a[0].is_ascii_alphabetic() || a[0] == '_') {
        return Err(err());
    }
    while i < a.len() && (a[i].is_ascii_alphanumeric() || a[i] == '_') {
        i += 1;
    }
    let name: String = a[..i].iter().collect();
    let s = i;
    while i < a.len() && sp(a[i]) {
        i += 1;
    }
    if i == s || !starts(a, i, "FROM") {
        return Err(err());
    }
    i += 4;
    let s = i;
    while i < a.len() && sp(a[i]) {
        i += 1;
    }
    if i == s || i >= a.len() {
        return Err(err());
    }
    if a[i..].iter().any(|c| *c == '\u{2028}' || *c == '\u{2029}') {
        return Err(err());
    }
    Ok((name, a[i..].iter().collect()))
}

fn in_ranges(c: char, r: &[(u32, u32)]) -> bool {
    let u = c as u32;
    r.iter().any(|&(a, b)| a <= u && u <= b)
}

fn invisible(c: char) -> bool {
    const R: &[(u32, u32)] = &[
        (0x9, 0xD), (0x20, 0x20), (0xA0, 0xA0), (0x1680, 0x1680), (0x2000, 0x200A),
        (0x2028, 0x2029), (0x202F, 0x202F), (0x205F, 0x205F), (0x3000, 0x3000), (0xFEFF, 0xFEFF),
        (0xAD, 0xAD), (0x600, 0x605), (0x61C, 0x61C), (0x6DD, 0x6DD), (0x70F, 0x70F),
        (0x890, 0x891), (0x8E2, 0x8E2), (0x180E, 0x180E), (0x200B, 0x200F), (0x202A, 0x202E),
        (0x2060, 0x2064), (0x2066, 0x206F), (0xFFF9, 0xFFFB), (0x110BD, 0x110BD),
        (0x110CD, 0x110CD), (0x13430, 0x1343F), (0x1BCA0, 0x1BCA3), (0x1D173, 0x1D17A),
        (0xE0001, 0xE0001), (0xE0020, 0xE007F),
    ];
    in_ranges(c, R)
}

fn skip_sp(a: &[char], mut i: usize) -> usize {
    while i < a.len() && sp(a[i]) {
        i += 1;
    }
    i
}

fn parse_authority(v: &[char]) -> Result<(String, Value), String> {
    let err = || "bad AUTHORITY".to_string();
    let mut i = 0;
    if !starts(v, i, "{") {
        return Err(err());
    }
    i = skip_sp(v, i + 1);
    if !starts(v, i, "expr:") {
        return Err(err());
    }
    i = skip_sp(v, i + 5);
    if !starts(v, i, "\"") {
        return Err(err());
    }
    let st = i;
    let mut j = i + 1;
    loop {
        if j >= v.len() {
            return Err(err());
        }
        if v[j] == '\\' {
            if j + 1 >= v.len() {
                return Err(err());
            }
            j += 2;
        } else if v[j] == '"' {
            break;
        } else {
            j += 1;
        }
    }
    let lit: String = v[st..=j].iter().collect();
    i = skip_sp(v, j + 1);
    if !starts(v, i, ",") {
        return Err(err());
    }
    i = skip_sp(v, i + 1);
    if !starts(v, i, "equals:") {
        return Err(err());
    }
    i = skip_sp(v, i + 7);
    if i >= v.len() || v[v.len() - 1] != '}' {
        return Err(err());
    }
    let mut e = v[i..v.len() - 1].to_vec();
    while e.last().map_or(false, |c| sp(*c)) {
        e.pop();
    }
    let es: String = e.iter().collect();
    let expr: String = serde_json::from_str::<String>(&lit).map_err(|x| x.to_string())?;
    let val: Value = serde_json::from_str::<Value>(&es).map_err(|x| x.to_string())?;
    check_numerals(&e)?;
    if !expr.chars().any(|c| !invisible(c)) {
        return Err(err());
    }
    Ok((expr, rebuild(&val)))
}

fn check_numerals(e: &[char]) -> Result<(), String> {
    let err = || "bad numeral".to_string();
    let mut i = 0;
    while i < e.len() {
        let c = e[i];
        if c == '"' {
            i += 1;
            while i < e.len() && e[i] != '"' {
                i += if e[i] == '\\' { 2 } else { 1 };
            }
            i += 1;
        } else if c == '-' || c.is_ascii_digit() {
            let s = i;
            if e[i] == '-' {
                i += 1;
            }
            let ds = i;
            while i < e.len() && e[i].is_ascii_digit() {
                i += 1;
            }
            let digits: String = e[ds..i].iter().collect();
            let mut int_form = true;
            let mut mant_end = i;
            if i < e.len() && e[i] == '.' {
                int_form = false;
                i += 1;
                while i < e.len() && e[i].is_ascii_digit() {
                    i += 1;
                }
                mant_end = i;
            }
            if i < e.len() && (e[i] == 'e' || e[i] == 'E') {
                int_form = false;
                i += 1;
                if i < e.len() && (e[i] == '+' || e[i] == '-') {
                    i += 1;
                }
                while i < e.len() && e[i].is_ascii_digit() {
                    i += 1;
                }
            }
            let tok: String = e[s..i].iter().collect();
            let x: f64 = tok.parse().map_err(|_| err())?;
            if !x.is_finite() || x.abs() > 9007199254740992.0 {
                return Err(err());
            }
            if x == 0.0 && e[s..mant_end].iter().any(|c| ('1'..='9').contains(c)) {
                return Err(err());
            }
            if int_form && digits != (x.abs() as u64).to_string() {
                return Err(err());
            }
        } else {
            i += 1;
        }
    }
    Ok(())
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
        other => other.clone(),
    }
}

pub fn carried_declared(text: &str) -> Result<Option<Rec>, String> {
    let dirs = parse_dirs(text);
    let n = dirs.iter().filter(|d| d.name == "CARRIED").count();
    if n == 0 {
        return Ok(None);
    }
    if n > 1 {
        return Err("one CARRIED table per primary".into());
    }
    if dirs
        .iter()
        .any(|d| d.name == "CANONICAL-SHA256" || d.name == "SHAPE" || d.name == "AUTHORITY")
    {
        return Err("sub-field not indented".into());
    }
    let d = dirs.iter().find(|d| d.name == "CARRIED").unwrap();
    let (name, from) = parse_head(&d.args)?;
    let mut sha: Option<String> = None;
    let mut shape: Option<String> = None;
    let mut asserts: Vec<(String, Value)> = Vec::new();
    for b in &d.conts {
        for kw in ["CANONICAL-SHA256", "SHAPE", "AUTHORITY"] {
            if !starts(b, 0, kw) {
                continue;
            }
            let k = kw.len();
            if let Some(&c) = b.get(k) {
                if c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-' {
                    continue;
                }
            }
            let value: Vec<char> = if b.len() == k {
                Vec::new()
            } else if sp(b[k]) {
                b[skip_sp(b, k)..].to_vec()
            } else {
                return Err("bad keyword line".into());
            };
            match kw {
                "CANONICAL-SHA256" => {
                    if sha.is_some() {
                        return Err("repeated hash".into());
                    }
                    if value.len() != 64 || !value.iter().all(|c| c.is_ascii_digit() || ('a'..='f').contains(c)) {
                        return Err("bad hash".into());
                    }
                    sha = Some(value.iter().collect());
                }
                "SHAPE" => {
                    if shape.is_some() {
                        return Err("repeated shape".into());
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
