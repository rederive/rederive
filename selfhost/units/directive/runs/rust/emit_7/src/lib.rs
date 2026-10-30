fn sep(c: char) -> bool {
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

fn opener(c: char) -> bool {
    matches!(
        c,
        ' ' | '\t' | '(' | '[' | '{' | ',' | '=' | ':' | ';' | '|' | '<' | '>' | '!' | '&' | '-' | '~'
    )
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let mut lines = Vec::new();
    let mut cur: Vec<char> = Vec::new();
    let mut it = text.chars().peekable();
    while let Some(c) = it.next() {
        if c == '\r' {
            if it.peek() == Some(&'\n') {
                it.next();
            }
            lines.push(std::mem::take(&mut cur));
        } else if c == '\n' {
            lines.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
    }
    lines.push(cur);
    lines
}

fn spans(ch: &[char]) -> Vec<(usize, usize)> {
    let n = ch.len();
    let mut out = Vec::new();
    let mut prev_close: Option<usize> = None;
    let mut i = 0;
    while i < n {
        if ch[i] == '"' && (i == 0 || opener(ch[i - 1]) || prev_close == Some(i - 1)) {
            let mut j = i + 1;
            let mut close = None;
            while j < n {
                if ch[j] == '\\' {
                    j += 2;
                } else if ch[j] == '"' {
                    close = Some(j);
                    break;
                } else {
                    j += 1;
                }
            }
            match close {
                Some(j) => {
                    out.push((i, j));
                    prev_close = Some(j);
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

fn in_span(sp: &[(usize, usize)], idx: isize) -> bool {
    if idx < 0 {
        return false;
    }
    let k = idx as usize;
    sp.iter().any(|&(a, b)| a < k && k < b)
}

fn attr_cut(s: &[char], offset: isize, sp: &[(usize, usize)]) -> String {
    let kws = ["CITED", "EARNED", "ANCHOR"];
    let mut end = s.len();
    'outer: for k in 1..s.len() {
        if !sep(s[k - 1]) {
            continue;
        }
        for kw in kws.iter() {
            let w: Vec<char> = kw.chars().collect();
            if k + w.len() <= s.len() && s[k..k + w.len()] == w[..] {
                let after = k + w.len();
                if (after == s.len() || sep(s[after])) && !in_span(sp, offset + k as isize) {
                    end = k;
                    break 'outer;
                }
            }
        }
    }
    s[..end]
        .iter()
        .collect::<String>()
        .trim_matches(|c| c == ' ' || c == '\t')
        .to_string()
}

pub fn directive(text: &str, name: &str) -> Result<Option<String>, String> {
    if !is_name(name) || name == "CITED" {
        return Err(format!("not a directive name: {:?}", name));
    }
    let mut collecting = false;
    let mut pieces: Vec<String> = Vec::new();
    let mut started = false;
    for raw in split_lines(text) {
        let mut lead_end = 0;
        while lead_end < raw.len() && (sep(raw[lead_end]) || raw[lead_end] == '\u{feff}') {
            lead_end += 1;
        }
        let mut line: Vec<char> = raw[..lead_end].iter().copied().filter(|&c| c != '\u{feff}').collect();
        line.extend_from_slice(&raw[lead_end..]);
        while line.last().map_or(false, |&c| sep(c)) {
            line.pop();
        }
        if line.is_empty() {
            continue;
        }
        let indent = line.iter().take_while(|&&c| sep(c)).count();
        let content = &line[indent..];
        if content[0] == '#' {
            continue;
        }
        let sp = spans(content);
        let n = content.len();
        let mut cut = n;
        for k in 1..n {
            if content[k] == '#'
                && sep(content[k - 1])
                && (k + 1 == n || sep(content[k + 1]))
                && !in_span(&sp, k as isize)
            {
                cut = k;
                break;
            }
        }
        let mut code = &content[..cut];
        while code.last().map_or(false, |&c| sep(c)) {
            code = &code[..code.len() - 1];
        }
        let mut dname: Option<String> = None;
        let mut wl = 0;
        if indent == 0 {
            wl = code.iter().take_while(|&&c| !sep(c)).count();
            let word: String = code[..wl].iter().collect();
            let w = word.strip_suffix(':').unwrap_or(&word);
            if is_name(w) && w != "CITED" {
                dname = Some(w.to_string());
            }
        }
        if let Some(d) = dname {
            if collecting {
                break;
            }
            started = true;
            if d == name {
                collecting = true;
                pieces.push(attr_cut(&code[wl..], wl as isize, &sp));
            }
        } else if started && collecting {
            let mut s = vec![' '];
            s.extend_from_slice(code);
            pieces.push(attr_cut(&s, -1, &sp));
        }
    }
    if !collecting {
        return Ok(None);
    }
    let v: Vec<String> = pieces.into_iter().filter(|p| !p.is_empty()).collect();
    Ok(Some(v.join(" ")))
}
