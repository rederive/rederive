fn sep(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn is_name(s: &[char]) -> bool {
    !s.is_empty()
        && s[0].is_ascii_uppercase()
        && s[1..]
            .iter()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

fn opener(c: char) -> bool {
    matches!(
        c,
        ' ' | '\t' | '(' | '[' | '{' | ',' | '=' | ':' | ';' | '|' | '<' | '>' | '!' | '&' | '-' | '~'
    )
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let mut lines = Vec::new();
    let mut cur = Vec::new();
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

fn spans(c: &[char]) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let mut i = 0;
    let mut prev_close: Option<usize> = None;
    while i < c.len() {
        if c[i] == '"' && (i == 0 || opener(c[i - 1]) || prev_close == Some(i - 1)) {
            let mut j = i + 1;
            let mut closed = false;
            while j < c.len() {
                if c[j] == '\\' {
                    j += 2;
                } else if c[j] == '"' {
                    closed = true;
                    break;
                } else {
                    j += 1;
                }
            }
            if !closed {
                break;
            }
            out.push((i, j));
            prev_close = Some(j);
            i = j + 1;
        } else {
            i += 1;
        }
    }
    out
}

fn trim_sep(s: &[char]) -> &[char] {
    let mut a = 0;
    let mut b = s.len();
    while a < b && sep(s[a]) {
        a += 1;
    }
    while b > a && sep(s[b - 1]) {
        b -= 1;
    }
    &s[a..b]
}

fn attr_cut(s: &[char], base: i64, sp: &[(usize, usize)]) -> String {
    let kws: [&str; 3] = ["CITED", "EARNED", "ANCHOR"];
    let mut cut = s.len();
    'outer: for p in 1..s.len() {
        if !sep(s[p - 1]) {
            continue;
        }
        for kw in kws.iter() {
            let k: Vec<char> = kw.chars().collect();
            if p + k.len() <= s.len()
                && s[p..p + k.len()] == k[..]
                && (p + k.len() == s.len() || sep(s[p + k.len()]))
            {
                let ci = p as i64 + base;
                let inside = sp
                    .iter()
                    .any(|&(a, b)| (a as i64) < ci && ci < (b as i64));
                if !inside {
                    cut = p;
                    break 'outer;
                }
            }
        }
    }
    trim_sep(&s[..cut]).iter().collect()
}

pub fn directive(text: &str, name: &str) -> Result<Option<String>, String> {
    let nc: Vec<char> = name.chars().collect();
    if !is_name(&nc) || name == "CITED" {
        return Err(format!("not a directive name: {:?}", name));
    }
    let mut found = false;
    let mut current = false;
    let mut pieces: Vec<String> = Vec::new();
    for line in split_lines(text) {
        let mut k = 0;
        let mut l: Vec<char> = Vec::new();
        while k < line.len() && (sep(line[k]) || line[k] == '\u{feff}') {
            if line[k] != '\u{feff}' {
                l.push(line[k]);
            }
            k += 1;
        }
        l.extend_from_slice(&line[k..]);
        while let Some(&c) = l.last() {
            if sep(c) {
                l.pop();
            } else {
                break;
            }
        }
        if l.is_empty() {
            continue;
        }
        let ind = l.iter().take_while(|&&c| sep(c)).count();
        let content = &l[ind..];
        if content[0] == '#' {
            continue;
        }
        let sp = spans(content);
        let mut code_end = content.len();
        for i in 1..content.len() {
            if content[i] == '#'
                && sep(content[i - 1])
                && (i + 1 == content.len() || sep(content[i + 1]))
                && !sp.iter().any(|&(a, b)| a < i && i < b)
            {
                code_end = i;
                break;
            }
        }
        let mut code = &content[..code_end];
        while let Some(&c) = code.last() {
            if sep(c) {
                code = &code[..code.len() - 1];
            } else {
                break;
            }
        }
        let mut started: Option<(String, usize)> = None;
        if ind == 0 {
            let w = code.iter().position(|&c| sep(c)).unwrap_or(code.len());
            let mut word = &code[..w];
            if word.len() >= 2 && word[word.len() - 1] == ':' && is_name(&word[..word.len() - 1]) {
                word = &word[..word.len() - 1];
            }
            if is_name(word) {
                let n: String = word.iter().collect();
                if n != "CITED" {
                    started = Some((n, w));
                }
            }
        }
        if let Some((n, w)) = started {
            if found {
                break;
            }
            current = n == name;
            if current {
                found = true;
                pieces.push(attr_cut(&code[w..], w as i64, &sp));
            }
        } else if current {
            let mut s = vec![' '];
            s.extend_from_slice(code);
            pieces.push(attr_cut(&s, -1, &sp));
        }
    }
    if !found {
        return Ok(None);
    }
    let v: Vec<String> = pieces.into_iter().filter(|p| !p.is_empty()).collect();
    Ok(Some(v.join(" ")))
}
