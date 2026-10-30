fn sep(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn is_name(s: &[char]) -> bool {
    !s.is_empty()
        && s[0].is_ascii_uppercase()
        && s[1..].iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
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
    let n = c.len();
    let mut res = Vec::new();
    let mut i = 0;
    while i < n {
        if c[i] == '"' {
            let mut j = i + 1;
            let mut ok = None;
            while j < n {
                let ch = c[j];
                if ch == '"' {
                    ok = Some(j);
                    break;
                } else if ch == '\\' {
                    if j + 1 >= n || c[j + 1] == '\u{2028}' || c[j + 1] == '\u{2029}' {
                        break;
                    }
                    j += 2;
                } else {
                    j += 1;
                }
            }
            if let Some(e) = ok {
                res.push((i, e));
                i = e + 1;
                continue;
            }
        }
        i += 1;
    }
    res
}

fn comment_cut(c: &[char]) -> &[char] {
    let sp = spans(c);
    for i in 0..c.len() {
        if c[i] == '#'
            && i > 0
            && sep(c[i - 1])
            && (i + 1 == c.len() || sep(c[i + 1]))
            && !sp.iter().any(|&(a, b)| a < i && i < b)
        {
            let mut e = i;
            while e > 0 && sep(c[e - 1]) {
                e -= 1;
            }
            return &c[..e];
        }
    }
    c
}

fn attr_cut(s: &[char]) -> String {
    let kws = ["CITED", "EARNED", "ANCHOR"];
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
    let mut cur: Option<(bool, Vec<String>)> = None;
    let mut found: Option<Vec<String>> = None;
    for line in split_lines(text) {
        let mut a = 0;
        while a < line.len() && line[a] == '\u{FEFF}' {
            a += 1;
        }
        let mut b = line.len();
        while b > a && sep(line[b - 1]) {
            b -= 1;
        }
        let l = &line[a..b];
        if l.is_empty() {
            continue;
        }
        let mut ind = 0;
        while ind < l.len() && sep(l[ind]) {
            ind += 1;
        }
        let content = &l[ind..];
        if content.first() == Some(&'#') {
            continue;
        }
        let code = comment_cut(content);
        let mut starts: Option<String> = None;
        let mut rest: &[char] = &[];
        if ind == 0 {
            let p = code.iter().position(|&c| sep(c)).unwrap_or(code.len());
            let word = &code[..p];
            rest = &code[p..];
            let w = if word.len() > 1 && word[word.len() - 1] == ':' && is_name(&word[..word.len() - 1]) {
                &word[..word.len() - 1]
            } else {
                word
            };
            if is_name(w) && w.iter().collect::<String>() != "CITED" {
                starts = Some(w.iter().collect());
            }
        }
        if let Some(n) = starts {
            if let Some((m, p)) = cur.take() {
                if m {
                    found = Some(p);
                    break;
                }
            }
            let m = n == name;
            cur = Some((m, vec![attr_cut(rest)]));
        } else if let Some((_, p)) = cur.as_mut() {
            let mut s = vec![' '];
            s.extend_from_slice(code);
            p.push(attr_cut(&s));
        }
    }
    if found.is_none() {
        if let Some((m, p)) = cur.take() {
            if m {
                found = Some(p);
            }
        }
    }
    Ok(found.map(|p| p.into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" ")))
}
