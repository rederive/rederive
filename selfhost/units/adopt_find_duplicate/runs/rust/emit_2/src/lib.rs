use std::collections::HashSet;

fn ws(c: char) -> bool {
    matches!(c, '\u{9}'..='\u{D}' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

fn brk(c: char) -> bool {
    matches!(c, '\r' | '\u{2028}' | '\u{2029}')
}

fn lines_of(s: &str) -> Vec<&str> {
    s.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).collect()
}

fn u16len(s: &str) -> usize {
    s.encode_utf16().count()
}

fn one_line_fence(line: &str) -> bool {
    let t = line.trim_matches(ws);
    t.starts_with("```") && t.ends_with("```") && u16len(t) >= 7 && !t.chars().any(brk)
}

fn fence_line(line: &str) -> bool {
    let t = line.trim_start_matches(ws);
    (t.starts_with("```") || t.starts_with("~~~")) && !one_line_fence(line)
}

fn run_of(line: &str) -> Option<(char, usize, &str)> {
    let t = line.trim_start_matches(ws);
    let c = t.chars().next()?;
    if c != '`' && c != '~' {
        return None;
    }
    let n = t.chars().take_while(|&x| x == c).count();
    if n >= 3 {
        Some((c, n, &t[n..]))
    } else {
        None
    }
}

fn heading_t(line: &str) -> Option<&str> {
    let n = line.chars().take_while(|&c| c == '#').count();
    if n == 0 || n > 6 {
        return None;
    }
    let t = &line[n..];
    let chars: Vec<char> = t.chars().collect();
    if chars.len() < 2 || !ws(chars[0]) {
        return None;
    }
    let lead = chars.iter().take_while(|&&c| ws(c)).count();
    for (i, &c) in chars.iter().enumerate() {
        if brk(c) && (i >= lead || i == chars.len() - 1) {
            return None;
        }
    }
    Some(t)
}

fn heading_key(t: &str) -> String {
    let mut t = t.trim_end_matches(ws);
    if t.ends_with(')') {
        let body = &t[..t.len() - 1];
        let start = body.rfind(')').map(|p| p + 1).unwrap_or(0);
        if let Some(p) = body[start..].find('(') {
            t = &t[..start + p];
        }
    }
    let mut out = String::new();
    let mut pending = false;
    for c in t.chars().flat_map(|c| c.to_lowercase()) {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            if pending && !out.is_empty() {
                out.push(' ');
            }
            pending = false;
            out.push(c);
        } else {
            pending = true;
        }
    }
    out
}

fn classify(lines: &[&str]) -> Vec<Option<String>> {
    let mut res = Vec::with_capacity(lines.len());
    let mut open: Option<(char, usize)> = None;
    for &l in lines {
        match open {
            Some((oc, on)) => {
                if let Some((c, n, rest)) = run_of(l) {
                    if c == oc && n >= on && rest.chars().all(ws) {
                        open = None;
                    }
                }
                res.push(None);
            }
            None => {
                if fence_line(l) {
                    let (c, n, _) = run_of(l).unwrap();
                    open = Some((c, n));
                    res.push(None);
                } else {
                    res.push(heading_t(l).map(heading_key_wrap));
                }
            }
        }
    }
    res
}

fn heading_key_wrap(t: &str) -> String {
    heading_key(t)
}

fn norm(s: &str) -> String {
    s.split(ws).filter(|x| !x.is_empty()).collect::<Vec<_>>().join(" ")
}

fn begin_mention_end(s: &str, i: usize) -> Option<usize> {
    let rest = s[i + 4..].trim_start_matches(ws);
    let j = s.len() - rest.len();
    let kw = "rederive:begin";
    if !rest.starts_with(kw) {
        return None;
    }
    let k = j + kw.len();
    match s[k..].chars().next() {
        None => Some(k),
        Some(c) if !(c.is_ascii_alphanumeric() || c == '_') => Some(k),
        _ => None,
    }
}

fn occurrences(s: &str) -> Vec<usize> {
    let mut v = Vec::new();
    let mut from = 0;
    while let Some(p) = s[from..].find("<!--") {
        v.push(from + p);
        from += p + 1;
    }
    v
}

fn has_begin_mention(s: &str) -> bool {
    occurrences(s).into_iter().any(|i| begin_mention_end(s, i).is_some())
}

fn end_marker(s: &str) -> Option<(usize, usize)> {
    for i in occurrences(s) {
        let rest = s[i + 4..].trim_start_matches(ws);
        if let Some(r2) = rest.strip_prefix("rederive:end") {
            let r3 = r2.trim_start_matches(ws);
            if let Some(r4) = r3.strip_prefix("-->") {
                return Some((i, s.len() - r4.len()));
            }
        }
    }
    None
}

fn section_body(section: &str) -> String {
    let joined = lines_of(section).join("\n");
    let mut body: &str = &joined;
    for i in occurrences(&joined) {
        if let Some(k) = begin_mention_end(&joined, i) {
            if let Some(a) = joined[k..].find("-->") {
                let lt = joined[k..].find("<!--");
                if lt.map_or(true, |q| a < q) {
                    body = &joined[k + a + 3..];
                    break;
                }
            }
        }
    }
    let body = match end_marker(body) {
        Some((i, _)) => &body[..i],
        None => body,
    };
    body.trim_matches(ws).to_string()
}

pub fn adopt_find_duplicate(existing: &str, section: &str) -> Option<(String, i64, i64)> {
    if has_begin_mention(existing) {
        return None;
    }
    let body = section_body(section);
    let blines: Vec<&str> = body.split('\n').collect();
    let bcls = classify(&blines);
    let keys: HashSet<String> = bcls.iter().flatten().filter(|k| !k.is_empty()).cloned().collect();
    if keys.is_empty() {
        return None;
    }
    let mut pool: HashSet<String> = HashSet::new();
    for (i, &l) in blines.iter().enumerate() {
        if l.chars().all(ws) || bcls[i].is_some() || fence_line(l) {
            continue;
        }
        let n = norm(l);
        if u16len(&n) > 15 {
            pool.insert(n);
        }
    }
    let elines = lines_of(existing);
    let ecls = classify(&elines);
    let heads: Vec<(usize, &String)> = ecls.iter().enumerate().filter_map(|(i, k)| k.as_ref().map(|k| (i, k))).collect();
    let matched = |k: &String| !k.is_empty() && keys.contains(k);
    let mut h = 0;
    while h < heads.len() {
        if !matched(heads[h].1) {
            h += 1;
            continue;
        }
        let mut e = h;
        while e < heads.len() && matched(heads[e].1) {
            e += 1;
        }
        let start = heads[h].0;
        let end = if e < heads.len() { heads[e].0 } else { elines.len() };
        let seen: HashSet<String> = elines[start..end].iter().map(|l| norm(l)).collect();
        if pool.iter().filter(|p| seen.contains(*p)).count() >= 2 {
            return Some((elines[start].trim_matches(ws).to_string(), start as i64, end as i64));
        }
        h = e;
    }
    None
}
