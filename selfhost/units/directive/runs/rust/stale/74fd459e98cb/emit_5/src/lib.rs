fn sep(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn is_name(s: &[char]) -> bool {
    match s.first() {
        Some(c) if c.is_ascii_uppercase() => {}
        _ => return false,
    }
    s[1..]
        .iter()
        .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
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

fn spans(c: &[char]) -> Vec<(usize, usize)> {
    let mut v = Vec::new();
    let mut i = 0;
    while i < c.len() {
        if c[i] != '"' {
            i += 1;
            continue;
        }
        let mut j = i + 1;
        let mut end = None;
        while j < c.len() {
            match c[j] {
                '"' => {
                    end = Some(j);
                    break;
                }
                '\\' => {
                    if j + 1 >= c.len() || c[j + 1] == '\u{2028}' || c[j + 1] == '\u{2029}' {
                        break;
                    }
                    j += 2;
                }
                _ => j += 1,
            }
        }
        match end {
            Some(e) => {
                v.push((i, e));
                i = e + 1;
            }
            None => i += 1,
        }
    }
    v
}

fn comment_cut(c: &[char]) -> &[char] {
    let sp = spans(c);
    for i in 1..c.len() {
        if c[i] != '#' || !sep(c[i - 1]) {
            continue;
        }
        if i + 1 < c.len() && !sep(c[i + 1]) {
            continue;
        }
        if sp.iter().any(|&(a, b)| a < i && i < b) {
            continue;
        }
        let mut j = i;
        while j > 0 && sep(c[j - 1]) {
            j -= 1;
        }
        return &c[..j];
    }
    c
}

fn attr_cut(s: &[char]) -> String {
    let kws: [&str; 3] = ["CITED", "EARNED", "ANCHOR"];
    for k in 1..s.len() {
        if !sep(s[k - 1]) {
            continue;
        }
        for kw in kws.iter() {
            let kc: Vec<char> = kw.chars().collect();
            let e = k + kc.len();
            if e <= s.len() && s[k..e] == kc[..] && (e == s.len() || sep(s[e])) {
                return trim_sep(&s[..k]).iter().collect();
            }
        }
    }
    trim_sep(s).iter().collect()
}

pub fn directive(text: &str, name: &str) -> Result<Option<String>, String> {
    let nc: Vec<char> = name.chars().collect();
    if !is_name(&nc) {
        return Err(format!("not a directive name: {:?}", name));
    }
    let mut found = false;
    let mut pieces: Vec<String> = Vec::new();
    let mut started = false;
    for raw in split_lines(text) {
        let mut a = 0;
        while a < raw.len() && raw[a] == '\u{FEFF}' {
            a += 1;
        }
        let mut b = raw.len();
        while b > a && sep(raw[b - 1]) {
            b -= 1;
        }
        let line = &raw[a..b];
        if line.is_empty() {
            continue;
        }
        let mut ind = 0;
        while ind < line.len() && sep(line[ind]) {
            ind += 1;
        }
        let content = &line[ind..];
        if content[0] == '#' {
            continue;
        }
        let code = comment_cut(content);
        let mut dname: Option<Vec<char>> = None;
        let mut rest: &[char] = &[];
        if ind == 0 {
            let w = code.iter().position(|&c| sep(c)).unwrap_or(code.len());
            let word = &code[..w];
            rest = &code[w..];
            let nm: &[char] = if word.len() >= 1 && word[word.len() - 1] == ':' && is_name(&word[..word.len() - 1]) {
                &word[..word.len() - 1]
            } else {
                word
            };
            if is_name(nm) && nm.iter().collect::<String>() != "CITED" {
                dname = Some(nm.to_vec());
            }
        }
        if let Some(n) = dname {
            if found {
                break;
            }
            started = true;
            if n == nc {
                found = true;
                pieces.push(attr_cut(rest));
            }
        } else if started && found {
            let mut s = vec![' '];
            s.extend_from_slice(code);
            pieces.push(attr_cut(&s));
        }
    }
    if !found {
        return Ok(None);
    }
    let v: Vec<String> = pieces.into_iter().filter(|p| !p.is_empty()).collect();
    Ok(Some(v.join(" ")))
}
