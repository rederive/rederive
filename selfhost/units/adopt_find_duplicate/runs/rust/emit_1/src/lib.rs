use std::collections::BTreeSet;

fn ws(c: char) -> bool {
    matches!(c, '\u{9}'..='\u{D}' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

fn brk(c: char) -> bool {
    matches!(c, '\r' | '\u{2028}' | '\u{2029}')
}

fn word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn u16len(s: &str) -> usize {
    s.chars().map(|c| c.len_utf16()).sum()
}

fn r1_lines(s: &str) -> Vec<&str> {
    s.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).collect()
}

fn one_line_fence(line: &str) -> bool {
    let t = line.trim_matches(ws);
    t.starts_with("```") && t.ends_with("```") && u16len(t) >= 7 && !t.chars().any(brk)
}

fn fence_line(line: &str) -> bool {
    let s = line.trim_start_matches(ws);
    (s.starts_with("```") || s.starts_with("~~~")) && !one_line_fence(line)
}

fn run_info(line: &str) -> Option<(char, usize, &str)> {
    let s = line.trim_start_matches(ws);
    let c = s.chars().next()?;
    if c != '`' && c != '~' {
        return None;
    }
    let n = s.chars().take_while(|&x| x == c).count();
    if n >= 3 {
        Some((c, n, &s[n..]))
    } else {
        None
    }
}

fn heading_t(line: &str) -> Option<&str> {
    let n = line.bytes().take_while(|&b| b == b'#').count();
    if !(1..=6).contains(&n) {
        return None;
    }
    let t = &line[n..];
    let cs: Vec<char> = t.chars().collect();
    if cs.len() < 2 || !ws(cs[0]) {
        return None;
    }
    let lead = cs.iter().take_while(|&&c| ws(c)).count();
    for (i, &c) in cs.iter().enumerate() {
        if brk(c) && (i >= lead || i == cs.len() - 1) {
            return None;
        }
    }
    Some(t)
}

fn key_of(t: &str) -> String {
    let mut te = t.trim_end_matches(ws);
    if te.ends_with(')') {
        let p = te.len() - 1;
        let prev = te[..p].rfind(')').map(|i| i + 1).unwrap_or(0);
        if let Some(o) = te[prev..p].find('(') {
            te = &te[..prev + o];
        }
    }
    let mut out = String::new();
    let mut sep = false;
    for c in te.chars() {
        for l in c.to_lowercase() {
            if l.is_ascii_lowercase() || l.is_ascii_digit() {
                if sep && !out.is_empty() {
                    out.push(' ');
                }
                sep = false;
                out.push(l);
            } else {
                sep = true;
            }
        }
    }
    out
}

fn normalize(s: &str) -> String {
    s.split(ws).filter(|p| !p.is_empty()).collect::<Vec<_>>().join(" ")
}

fn heading_flags(lines: &[&str]) -> Vec<Option<String>> {
    let mut state: Option<(char, usize)> = None;
    let mut out = Vec::with_capacity(lines.len());
    for line in lines {
        let mut h = None;
        match state {
            None => {
                if fence_line(line) {
                    state = run_info(line).map(|(c, n, _)| (c, n));
                } else if let Some(t) = heading_t(line) {
                    h = Some(key_of(t));
                }
            }
            Some((c, n)) => {
                if let Some((rc, rn, rest)) = run_info(line) {
                    if rc == c && rn >= n && rest.chars().all(ws) {
                        state = None;
                    }
                }
            }
        }
        out.push(h);
    }
    out
}

fn mention_end(s: &str, at: usize) -> Option<usize> {
    let mut i = at + 4;
    let r = &s[i..];
    let r2 = r.trim_start_matches(ws);
    i += r.len() - r2.len();
    let kw = "rederive:begin";
    if !r2.starts_with(kw) {
        return None;
    }
    i += kw.len();
    match s[i..].chars().next() {
        Some(c) if word(c) => None,
        _ => Some(i),
    }
}

fn strip_end(s: &str) -> Option<usize> {
    for (at, _) in s.match_indices("<!--") {
        let r = &s[at + 4..];
        let r = r.trim_start_matches(ws);
        if let Some(r) = r.strip_prefix("rederive:end") {
            let r = r.trim_start_matches(ws);
            if r.starts_with("-->") {
                return Some(at);
            }
        }
    }
    None
}

pub fn adopt_find_duplicate(existing: &str, section: &str) -> Option<(String, i64, i64)> {
    for (at, _) in existing.match_indices("<!--") {
        if mention_end(existing, at).is_some() {
            return None;
        }
    }
    let joined = r1_lines(section).join("\n");
    let mut body: &str = &joined;
    for (at, _) in joined.match_indices("<!--") {
        if let Some(k) = mention_end(&joined, at) {
            let a = joined[k..].find("-->").map(|x| x + k);
            let b = joined[k..].find("<!--").map(|x| x + k);
            if let Some(a) = a {
                if b.map_or(true, |b| a < b) {
                    body = &joined[a + 3..];
                    break;
                }
            }
        }
    }
    if let Some(e) = strip_end(body) {
        body = &body[..e];
    }
    let body = body.trim_matches(ws);
    let blines: Vec<&str> = body.split('\n').collect();
    let flags = heading_flags(&blines);
    let keys: BTreeSet<String> = flags.iter().flatten().filter(|k| !k.is_empty()).cloned().collect();
    if keys.is_empty() {
        return None;
    }
    let mut pool: BTreeSet<String> = BTreeSet::new();
    for (l, f) in blines.iter().zip(flags.iter()) {
        if f.is_some() || fence_line(l) || l.chars().all(ws) {
            continue;
        }
        let n = normalize(l);
        if u16len(&n) > 15 {
            pool.insert(n);
        }
    }
    let elines = r1_lines(existing);
    let eflags = heading_flags(&elines);
    let heads: Vec<(usize, bool)> = eflags
        .iter()
        .enumerate()
        .filter_map(|(i, f)| f.as_ref().map(|k| (i, !k.is_empty() && keys.contains(k))))
        .collect();
    let mut i = 0;
    while i < heads.len() {
        if !heads[i].1 {
            i += 1;
            continue;
        }
        let mut j = i;
        while j < heads.len() && heads[j].1 {
            j += 1;
        }
        let start = heads[i].0;
        let end = if j < heads.len() { heads[j].0 } else { elines.len() };
        let norms: BTreeSet<String> = elines[start..end].iter().map(|l| normalize(l)).collect();
        if pool.iter().filter(|p| norms.contains(*p)).count() >= 2 {
            return Some((elines[start].trim_matches(ws).to_string(), start as i64, end as i64));
        }
        i = j;
    }
    None
}
