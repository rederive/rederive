// WS predicate over the pinned set.
fn ws(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\u{0B}' | '\u{0C}' | '\r' | '\u{2028}' | '\u{2029}' | '\u{FEFF}' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{202F}' | '\u{205F}' | '\u{3000}')
}

fn st(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn valid_name(s: &str) -> bool {
    let mut it = s.chars();
    match it.next() {
        Some(c) if c.is_ascii_uppercase() => {}
        _ => return false,
    }
    it.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
}

fn trim_ws(s: &str) -> &str {
    s.trim_matches(ws)
}

// Split into physical lines at CRLF, lone CR, lone LF.
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

// Cut at the first whole-token CITED/EARNED/ANCHOR preceded by space/tab.
fn attr_cut(s: &str) -> String {
    let ch: Vec<char> = s.chars().collect();
    let kws: [&str; 3] = ["CITED", "EARNED", "ANCHOR"];
    let mut cut = ch.len();
    'outer: for j in 1..ch.len() {
        if !st(ch[j - 1]) {
            continue;
        }
        for k in kws.iter() {
            let kc: Vec<char> = k.chars().collect();
            if j + kc.len() <= ch.len() && ch[j..j + kc.len()] == kc[..] {
                let e = j + kc.len();
                if e == ch.len() || st(ch[e]) {
                    cut = j;
                    break 'outer;
                }
            }
        }
    }
    let r: String = ch[..cut].iter().collect();
    trim_ws(&r).to_string()
}

fn comment_cut(content: &str) -> String {
    let ch: Vec<char> = content.chars().collect();
    for i in 1..ch.len() {
        if ch[i] == '#' && ws(ch[i - 1]) && (i + 1 == ch.len() || ws(ch[i + 1])) {
            let r: String = ch[..i - 1].iter().collect();
            return r.trim_end_matches(ws).to_string();
        }
    }
    content.to_string()
}

pub fn directive(text: &str, name: &str) -> Result<Option<String>, String> {
    if !valid_name(name) {
        return Err(format!("not a directive name: {:?}", name));
    }
    let mut dirs: Vec<(String, Vec<String>)> = Vec::new();
    for raw in split_lines(text) {
        let l = raw.trim_start_matches('\u{FEFF}').trim_end_matches(st);
        if l.chars().all(ws) {
            continue;
        }
        let content = l.trim_start_matches(st);
        let indent_empty = content.len() == l.len();
        if content.starts_with('#') {
            continue;
        }
        let code = comment_cut(content);
        if indent_empty {
            let (word, rest) = match code.find(st) {
                Some(p) => (&code[..p], code[p + 1..].trim_start_matches(st)),
                None => (&code[..], ""),
            };
            let w = if let Some(stripped) = word.strip_suffix(':') {
                stripped
            } else {
                word
            };
            if valid_name(w) {
                dirs.push((w.to_string(), vec![attr_cut(rest)]));
                continue;
            }
        }
        if let Some(d) = dirs.last_mut() {
            d.1.push(attr_cut(&format!(" {}", code)));
        }
    }
    for (n, pieces) in dirs {
        if n == name {
            let joined = pieces.join(" ");
            return Ok(Some(trim_ws(&joined).to_string()));
        }
    }
    Ok(None)
}
