fn is_name(s: &[char]) -> bool {
    !s.is_empty()
        && s[0].is_ascii_uppercase()
        && s[1..].iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

fn sep(c: char) -> bool {
    c == ' ' || c == '\t'
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
    let mut out = Vec::new();
    let mut cur = Vec::new();
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
    const OPENER: [char; 16] = [' ', '\t', '(', '[', '{', ',', '=', ':', ';', '|', '<', '>', '!', '&', '-', '~'];
    let mut res = Vec::new();
    let mut i = 0;
    let mut last_close: Option<usize> = None;
    while i < c.len() {
        let ok = c[i] == '"'
            && (i == 0 || OPENER.contains(&c[i - 1]) || last_close.map_or(false, |l| l + 1 == i));
        if !ok {
            i += 1;
            continue;
        }
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
        res.push((i, j));
        last_close = Some(j);
        i = j + 1;
    }
    res
}

fn attr_cut(s: &[char], delta: i64, sp: &[(usize, usize)]) -> String {
    let kws: [&str; 3] = ["CITED", "EARNED", "ANCHOR"];
    let mut end = s.len();
    for t in 1..s.len() {
        if !sep(s[t - 1]) {
            continue;
        }
        let mut hit = false;
        for k in kws.iter() {
            let kc: Vec<char> = k.chars().collect();
            if t + kc.len() <= s.len()
                && s[t..t + kc.len()] == kc[..]
                && (t + kc.len() == s.len() || sep(s[t + kc.len()]))
            {
                hit = true;
            }
        }
        if hit {
            let ci = t as i64 + delta;
            let inside = ci >= 0 && sp.iter().any(|&(a, b)| (a as i64) < ci && ci < (b as i64));
            if !inside {
                end = t;
                break;
            }
        }
    }
    trim_sep(&s[..end]).iter().collect()
}

pub fn directive(text: &str, name: &str) -> Result<Option<String>, String> {
    let nm: Vec<char> = name.chars().collect();
    if !is_name(&nm) || name == "CITED" {
        return Err(format!("not a directive name: {:?}", name));
    }
    let mut cur: Option<bool> = None;
    let mut found = false;
    let mut pieces: Vec<String> = Vec::new();
    for line in split_lines(text) {
        let mut l: Vec<char> = Vec::new();
        let mut lead = true;
        for ch in line {
            if lead {
                if ch == '\u{feff}' {
                    continue;
                }
                if !sep(ch) {
                    lead = false;
                }
            }
            l.push(ch);
        }
        let mut e = l.len();
        while e > 0 && sep(l[e - 1]) {
            e -= 1;
        }
        l.truncate(e);
        if l.is_empty() {
            continue;
        }
        let ind = l.iter().take_while(|c| sep(**c)).count();
        let content = &l[ind..];
        if content[0] == '#' {
            continue;
        }
        let sp = spans(content);
        let mut cut = content.len();
        for i in 1..content.len() {
            if content[i] == '#'
                && sep(content[i - 1])
                && (i + 1 == content.len() || sep(content[i + 1]))
                && !sp.iter().any(|&(a, b)| a < i && i < b)
            {
                cut = i;
                break;
            }
        }
        let code = {
            let mut c = cut;
            while c > 0 && sep(content[c - 1]) {
                c -= 1;
            }
            &content[..c]
        };
        let mut started: Option<(String, usize)> = None;
        if ind == 0 {
            let k = code.iter().position(|c| sep(*c)).unwrap_or(code.len());
            let w = &code[..k];
            let mut nmw = w;
            if let Some(&':') = w.last() {
                if is_name(&w[..w.len() - 1]) {
                    nmw = &w[..w.len() - 1];
                }
            }
            if is_name(nmw) && nmw.iter().collect::<String>() != "CITED" {
                started = Some((nmw.iter().collect(), k));
            }
        }
        if let Some((n, k)) = started {
            if found {
                break;
            }
            let is_t = n == name;
            cur = Some(is_t);
            if is_t {
                found = true;
                pieces.push(attr_cut(&code[k..], k as i64, &sp));
            }
        } else if let Some(true) = cur {
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
