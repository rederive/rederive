const WHAT: &str = "carried data declared under DEPENDS-ON \u{2014} use CARRIED (\u{a7}18)";

fn is_sp(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn is_opener(c: char) -> bool {
    matches!(
        c,
        ' ' | '\t' | '(' | '[' | '{' | ',' | '=' | ':' | ';' | '|' | '<' | '>' | '!' | '&' | '-' | '~'
    )
}

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let cs: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut cur = Vec::new();
    let mut i = 0;
    while i < cs.len() {
        let c = cs[i];
        if c == '\r' {
            if i + 1 < cs.len() && cs[i + 1] == '\n' {
                i += 1;
            }
            out.push(std::mem::take(&mut cur));
        } else if c == '\n' {
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
        i += 1;
    }
    out.push(cur);
    out
}

fn trim_line(raw: &[char]) -> Vec<char> {
    let mut v = Vec::new();
    let mut i = 0;
    while i < raw.len() && (is_sp(raw[i]) || raw[i] == '\u{feff}') {
        if raw[i] != '\u{feff}' {
            v.push(raw[i]);
        }
        i += 1;
    }
    v.extend_from_slice(&raw[i..]);
    while let Some(&l) = v.last() {
        if is_sp(l) {
            v.pop();
        } else {
            break;
        }
    }
    v
}

fn trim_sp(s: &[char]) -> &[char] {
    let mut a = 0;
    let mut b = s.len();
    while a < b && is_sp(s[a]) {
        a += 1;
    }
    while b > a && is_sp(s[b - 1]) {
        b -= 1;
    }
    &s[a..b]
}

fn spans(s: &[char]) -> Vec<(usize, usize)> {
    let n = s.len();
    let mut out = Vec::new();
    let mut last_close: Option<usize> = None;
    let mut i = 0;
    while i < n {
        if s[i] == '"' && (i == 0 || is_opener(s[i - 1]) || last_close == Some(i - 1)) {
            let mut j = i + 1;
            let mut found = None;
            while j < n {
                if s[j] == '\\' {
                    j += 2;
                    continue;
                }
                if s[j] == '"' {
                    found = Some(j);
                    break;
                }
                j += 1;
            }
            match found {
                Some(j) => {
                    out.push((i, j));
                    last_close = Some(j);
                    i = j + 1;
                }
                None => break,
            }
        } else {
            i += 1;
        }
    }
    out
}

fn inside(sp: &[(usize, usize)], p: usize) -> bool {
    sp.iter().any(|&(a, b)| a < p && p < b)
}

fn cut(part: &[char]) -> (Vec<char>, Option<String>) {
    let sp = spans(part);
    let n = part.len();
    for p in 1..n {
        if part[p] == '#'
            && is_sp(part[p - 1])
            && (p + 1 == n || is_sp(part[p + 1]))
            && !inside(&sp, p)
        {
            let mut code = part[..p].to_vec();
            while let Some(&l) = code.last() {
                if is_sp(l) {
                    code.pop();
                } else {
                    break;
                }
            }
            let c: String = trim_sp(&part[p + 1..]).iter().collect();
            return (code, Some(c));
        }
    }
    (part.to_vec(), None)
}

fn attrs(code: &[char]) -> (String, Vec<String>) {
    let mut piece = vec![' '];
    piece.extend_from_slice(code);
    let sp = spans(&piece);
    let n = piece.len();
    let mut marks: Vec<(usize, usize)> = Vec::new(); // (run start, value start)
    for w in 1..n {
        if !is_sp(piece[w - 1]) {
            continue;
        }
        for word in ["CITED", "EARNED", "ANCHOR"] {
            let wc: Vec<char> = word.chars().collect();
            let e = w + wc.len();
            if e <= n
                && piece[w..e] == wc[..]
                && (e == n || is_sp(piece[e]))
                && !inside(&sp, w)
            {
                let mut r = w;
                while r > 0 && is_sp(piece[r - 1]) {
                    r -= 1;
                }
                marks.push((r, e));
            }
        }
    }
    if marks.is_empty() {
        return (trim_sp(&piece).iter().collect(), Vec::new());
    }
    let body: String = trim_sp(&piece[..marks[0].0]).iter().collect();
    let mut vals = Vec::new();
    for k in 0..marks.len() {
        let end = if k + 1 < marks.len() { marks[k + 1].0 } else { n };
        let st = marks[k].1;
        let v = if st <= end { &piece[st..end] } else { &piece[0..0] };
        vals.push(trim_sp(v).iter().collect());
    }
    (body, vals)
}

fn valid_name(w: &[char]) -> bool {
    if w.is_empty() || !w[0].is_ascii_uppercase() {
        return false;
    }
    if !w.iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-') {
        return false;
    }
    let s: String = w.iter().collect();
    s != "CITED"
}

struct Dir {
    line: u64,
    text: String,
    dep: bool,
    args: String,
    conts: Vec<String>,
    vals: Vec<String>,
    comments: Vec<String>,
}

fn has_carried_word(c: &[char]) -> bool {
    let w: Vec<char> = "carried".chars().collect();
    let n = c.len();
    if n < 7 {
        return false;
    }
    for i in 0..=(n - 7) {
        if (0..7).all(|k| c[i + k].to_ascii_lowercase() == w[k]) {
            let before_ok = i == 0 || !c[i - 1].is_ascii_alphabetic();
            let after_ok = i + 7 == n || !c[i + 7].is_ascii_alphabetic();
            if before_ok && after_ok {
                return true;
            }
        }
    }
    false
}

fn has_name(c: &[char], name: &[char]) -> bool {
    let n = c.len();
    let m = name.len();
    if m == 0 || m > n {
        return false;
    }
    for i in 0..=(n - m) {
        if c[i..i + m] == name[..] {
            let before_ok = i == 0 || !is_word(c[i - 1]);
            let after_ok = i + m == n || !is_word(c[i + m]);
            if before_ok && after_ok {
                return true;
            }
        }
    }
    false
}

pub fn schema_lint(text: &str, carried_name: Option<&str>) -> (Vec<(u64, String, String)>,) {
    let mut dirs: Vec<Dir> = Vec::new();
    for (idx, raw) in split_lines(text).iter().enumerate() {
        let line = trim_line(raw);
        if line.is_empty() {
            continue;
        }
        let lead = line.iter().take_while(|c| is_sp(**c)).count();
        let part = &line[lead..];
        if part[0] == '#' {
            let mut k = 0;
            while k < part.len() && part[k] == '#' {
                k += 1;
            }
            if k < part.len() && is_sp(part[k]) {
                k += 1;
            }
            let c: String = part[k..].iter().collect();
            if let Some(d) = dirs.last_mut() {
                d.comments.push(c);
            }
            continue;
        }
        let (code, tc) = cut(part);
        let mut opened = false;
        if lead == 0 {
            let nend = code.iter().position(|c| is_sp(*c)).unwrap_or(code.len());
            let tok = &code[..nend];
            let word: &[char] = if tok.last() == Some(&':') { &tok[..tok.len() - 1] } else { tok };
            if valid_name(word) {
                let (body, vals) = attrs(&code[nend..]);
                let dep = tok.iter().collect::<String>() == "DEPENDS-ON"
                    || tok.iter().collect::<String>() == "DEPENDS-ON:";
                dirs.push(Dir {
                    line: (idx + 1) as u64,
                    text: line.iter().take(96).collect(),
                    dep,
                    args: body,
                    conts: Vec::new(),
                    vals,
                    comments: Vec::new(),
                });
                opened = true;
            }
        }
        if !opened {
            match dirs.last_mut() {
                Some(d) => {
                    let (body, vals) = attrs(&code);
                    if !body.is_empty() {
                        d.conts.push(body);
                    }
                    d.vals.extend(vals);
                }
                None => continue,
            }
        }
        if let Some(c) = tc {
            if let Some(d) = dirs.last_mut() {
                d.comments.push(c);
            }
        }
    }
    let name: Option<Vec<char>> = match carried_name {
        Some(n) if !n.is_empty() && n != "none" => Some(n.chars().collect()),
        _ => None,
    };
    let mut hits = Vec::new();
    for d in dirs.iter().filter(|d| d.dep) {
        let mut pieces: Vec<&str> = vec![d.args.as_str()];
        pieces.extend(d.conts.iter().map(|s| s.as_str()));
        pieces.extend(d.vals.iter().map(|s| s.as_str()));
        pieces.extend(d.comments.iter().map(|s| s.as_str()));
        let content: Vec<char> = pieces.join(" ").chars().collect();
        let hit = has_carried_word(&content)
            || name.as_ref().map_or(false, |n| has_name(&content, n));
        if hit {
            hits.push((d.line, WHAT.to_string(), d.text.clone()));
        }
    }
    (hits,)
}
