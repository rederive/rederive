fn is_sep(c: char) -> bool {
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

fn split_lines(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
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

fn trim_sep(s: &str) -> &str {
    s.trim_matches(is_sep)
}

fn attr_cut(s: &str) -> String {
    let chars: Vec<(usize, char)> = s.char_indices().collect();
    let mut i = 1;
    while i < chars.len() {
        if !is_sep(chars[i].1) && is_sep(chars[i - 1].1) {
            let start = chars[i].0;
            let mut end = s.len();
            for &(b, c) in &chars[i..] {
                if is_sep(c) {
                    end = b;
                    break;
                }
            }
            let w = &s[start..end];
            if w == "CITED" || w == "EARNED" || w == "ANCHOR" {
                return trim_sep(&s[..start]).to_string();
            }
            i = chars.iter().position(|&(b, _)| b == end).unwrap_or(chars.len());
            continue;
        }
        i += 1;
    }
    trim_sep(s).to_string()
}

fn comment_cut(content: &str) -> String {
    let ch: Vec<char> = content.chars().collect();
    let n = ch.len();
    let mut spans: Vec<(usize, usize)> = Vec::new();
    let mut i = 0;
    while i < n {
        if ch[i] == '"' {
            let mut j = i + 1;
            let mut end = None;
            loop {
                if j >= n {
                    break;
                }
                let c = ch[j];
                if c == '"' {
                    end = Some(j);
                    break;
                } else if c == '\\' {
                    if j + 1 >= n || ch[j + 1] == '\u{2028}' || ch[j + 1] == '\u{2029}' {
                        break;
                    }
                    j += 2;
                } else {
                    j += 1;
                }
            }
            match end {
                Some(e) => {
                    spans.push((i, e));
                    i = e + 1;
                }
                None => i += 1,
            }
        } else {
            i += 1;
        }
    }
    for p in 1..n {
        if ch[p] == '#'
            && is_sep(ch[p - 1])
            && (p + 1 == n || is_sep(ch[p + 1]))
            && !spans.iter().any(|&(a, b)| a < p && p < b)
        {
            let s: String = ch[..p].iter().collect();
            return trim_sep(&s).to_string();
        }
    }
    content.to_string()
}

pub fn directive(text: &str, name: &str) -> Result<Option<String>, String> {
    if !is_name(name) {
        return Err(format!("not a directive name: {:?}", name));
    }
    let mut pieces: Vec<String> = Vec::new();
    let mut active = false;
    let mut found = false;
    for raw in split_lines(text) {
        let l = raw.trim_start_matches('\u{FEFF}');
        let l = l.trim_end_matches(is_sep);
        if l.is_empty() {
            continue;
        }
        let content = l.trim_start_matches(is_sep);
        let indented = content.len() != l.len();
        if content.starts_with('#') {
            continue;
        }
        let code = comment_cut(content);
        let mut started: Option<String> = None;
        let mut rest = String::new();
        if !indented {
            let pos = code.find(is_sep);
            let (word, r) = match pos {
                Some(p) => (&code[..p], &code[p..]),
                None => (&code[..], ""),
            };
            let w = match word.strip_suffix(':') {
                Some(b) if is_name(b) => b,
                _ => word,
            };
            if is_name(w) && w != "CITED" {
                started = Some(w.to_string());
                rest = r.to_string();
            }
        }
        if let Some(n) = started {
            if found {
                break;
            }
            if n == name {
                found = true;
                active = true;
                pieces.push(attr_cut(&rest));
            }
        } else if active {
            pieces.push(attr_cut(&format!(" {}", code)));
        }
    }
    if !found {
        return Ok(None);
    }
    let v: Vec<String> = pieces.into_iter().filter(|p| !p.is_empty()).collect();
    Ok(Some(v.join(" ")))
}
