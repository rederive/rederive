fn is_ws(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | '\u{2028}' | '\u{2029}' | '\u{feff}' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | ' ')
}

fn is_st(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn trim_ws(s: &[char]) -> &[char] {
    let mut a = 0;
    let mut b = s.len();
    while a < b && is_ws(s[a]) {
        a += 1;
    }
    while b > a && is_ws(s[b - 1]) {
        b -= 1;
    }
    &s[a..b]
}

fn is_name(s: &[char]) -> bool {
    !s.is_empty()
        && s[0].is_ascii_uppercase()
        && s[1..].iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

fn attr_cut(s: &[char]) -> Vec<char> {
    for i in 1..s.len() {
        if !is_st(s[i - 1]) {
            continue;
        }
        for kw in ["CITED", "EARNED", "ANCHOR"] {
            let k: Vec<char> = kw.chars().collect();
            if s.len() >= i + k.len() && s[i..i + k.len()] == k[..] {
                let end = i + k.len();
                if end == s.len() || is_st(s[end]) {
                    return trim_ws(&s[..i]).to_vec();
                }
            }
        }
    }
    trim_ws(s).to_vec()
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

pub fn directive(text: &str, name: &str) -> Result<Option<String>, String> {
    let nm: Vec<char> = name.chars().collect();
    if !is_name(&nm) {
        return Err(format!("not a directive name: {:?}", name));
    }
    let mut cur: Option<(bool, Vec<Vec<char>>)> = None;
    for raw in split_lines(text) {
        let mut a = 0;
        while a < raw.len() && raw[a] == '\u{feff}' {
            a += 1;
        }
        let mut b = raw.len();
        while b > a && is_st(raw[b - 1]) {
            b -= 1;
        }
        let line = &raw[a..b];
        if line.iter().all(|c| is_ws(*c)) {
            continue;
        }
        let mut ind = 0;
        while ind < line.len() && is_st(line[ind]) {
            ind += 1;
        }
        let content = &line[ind..];
        if content[0] == '#' {
            continue;
        }
        let mut code: &[char] = content;
        for i in 1..content.len() {
            if content[i] == '#' && is_ws(content[i - 1]) && (i + 1 == content.len() || is_ws(content[i + 1])) {
                code = trim_ws_end(&content[..i - 1]);
                break;
            }
        }
        if ind == 0 {
            let p = code.iter().position(|c| is_st(*c));
            let (word, rest): (&[char], &[char]) = match p {
                Some(p) => {
                    let mut r = p + 1;
                    while r < code.len() && is_st(code[r]) {
                        r += 1;
                    }
                    (&code[..p], &code[r..])
                }
                None => (code, &[]),
            };
            let mut w = word;
            if w.len() > 1 && w[w.len() - 1] == ':' && is_name(&w[..w.len() - 1]) {
                w = &w[..w.len() - 1];
            }
            if is_name(w) {
                if let Some((true, pieces)) = cur.take() {
                    return Ok(Some(join(pieces)));
                }
                let m = w == &nm[..];
                cur = Some((m, vec![attr_cut(rest)]));
                continue;
            }
        }
        if let Some((_, pieces)) = cur.as_mut() {
            let mut s = vec![' '];
            s.extend_from_slice(code);
            pieces.push(attr_cut(&s));
        }
    }
    match cur {
        Some((true, pieces)) => Ok(Some(join(pieces))),
        _ => Ok(None),
    }
}

fn trim_ws_end(s: &[char]) -> &[char] {
    let mut b = s.len();
    while b > 0 && is_ws(s[b - 1]) {
        b -= 1;
    }
    &s[..b]
}

fn join(pieces: Vec<Vec<char>>) -> String {
    let mut all: Vec<char> = Vec::new();
    for (i, p) in pieces.iter().enumerate() {
        if i > 0 {
            all.push(' ');
        }
        all.extend_from_slice(p);
    }
    trim_ws(&all).iter().collect()
}
