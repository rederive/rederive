fn is_ws(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | '\u{2028}' | '\u{2029}' | '\u{feff}' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{202f}' | '\u{205f}' | '\u{3000}')
}

fn is_st(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn is_name(s: &str) -> bool {
    let mut it = s.chars();
    match it.next() {
        Some(c) if c.is_ascii_uppercase() => {}
        _ => return false,
    }
    it.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
}

fn split_lines(text: &str) -> Vec<&str> {
    let b = text.as_bytes();
    let mut out = Vec::new();
    let mut start = 0;
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'\r' {
            out.push(&text[start..i]);
            if i + 1 < b.len() && b[i + 1] == b'\n' {
                i += 1;
            }
            start = i + 1;
        } else if b[i] == b'\n' {
            out.push(&text[start..i]);
            start = i + 1;
        }
        i += 1;
    }
    out.push(&text[start..]);
    out
}

fn attr_cut(s: &str) -> String {
    let cs: Vec<char> = s.chars().collect();
    let mut end = cs.len();
    'outer: for p in 1..cs.len() {
        if !is_st(cs[p - 1]) {
            continue;
        }
        for kw in ["CITED", "EARNED", "ANCHOR"] {
            let k: Vec<char> = kw.chars().collect();
            if p + k.len() <= cs.len()
                && cs[p..p + k.len()] == k[..]
                && (p + k.len() == cs.len() || is_st(cs[p + k.len()]))
            {
                end = p;
                break 'outer;
            }
        }
    }
    let t: String = cs[..end].iter().collect();
    t.trim_matches(is_ws).to_string()
}

pub fn directive(text: &str, name: &str) -> Result<Option<String>, String> {
    if !is_name(name) {
        return Err(format!("not a directive name: {:?}", name));
    }
    let mut found: Option<Vec<String>> = None;
    for raw in split_lines(text) {
        let line = raw
            .trim_start_matches('\u{feff}')
            .trim_end_matches(is_st);
        if line.chars().all(is_ws) {
            continue;
        }
        let content = line.trim_start_matches(is_st);
        let indent_empty = content.len() == line.len();
        if content.starts_with('#') {
            continue;
        }
        let cs: Vec<char> = content.chars().collect();
        let mut code: String = content.to_string();
        for i in 1..cs.len() {
            if cs[i] == '#' && is_ws(cs[i - 1]) && (i + 1 == cs.len() || is_ws(cs[i + 1])) {
                let t: String = cs[..i - 1].iter().collect();
                code = t.trim_end_matches(is_ws).to_string();
                break;
            }
        }
        if indent_empty {
            let (word, rest) = match code.find(is_st) {
                Some(i) => (&code[..i], code[i + 1..].trim_start_matches(is_st)),
                None => (&code[..], ""),
            };
            let nm = match word.strip_suffix(':') {
                Some(w) if is_name(w) => Some(w),
                _ => {
                    if is_name(word) {
                        Some(word)
                    } else {
                        None
                    }
                }
            };
            if let Some(n) = nm {
                if found.is_some() {
                    break;
                }
                if n == name {
                    found = Some(vec![attr_cut(rest)]);
                }
                continue;
            }
        }
        if let Some(f) = found.as_mut() {
            f.push(attr_cut(&format!(" {}", code)));
        }
    }
    Ok(found.map(|f| f.join(" ").trim_matches(is_ws).to_string()))
}
