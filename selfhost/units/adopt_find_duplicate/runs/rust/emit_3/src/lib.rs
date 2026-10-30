use std::collections::HashSet;

fn ws(c: char) -> bool {
    matches!(c, '\u{9}'..='\u{D}' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

fn brk(c: char) -> bool {
    matches!(c, '\r' | '\u{2028}' | '\u{2029}')
}

fn split_lines(t: &str) -> Vec<&str> {
    t.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).collect()
}

fn u16len(s: &str) -> usize {
    s.encode_utf16().count()
}

fn one_line_fence(l: &str) -> bool {
    let t = l.trim_matches(ws);
    t.starts_with("```") && t.ends_with("```") && u16len(t) >= 7 && !t.chars().any(brk)
}

fn run_of(l: &str) -> Option<(char, usize, usize)> {
    let t = l.trim_start_matches(ws);
    let c = t.chars().next()?;
    if c != '`' && c != '~' {
        return None;
    }
    let n = t.chars().take_while(|&x| x == c).count();
    if n >= 3 {
        Some((c, n, l.len() - t.len() + n))
    } else {
        None
    }
}

fn is_fence_line(l: &str) -> bool {
    let t = l.trim_start_matches(ws);
    (t.starts_with("```") || t.starts_with("~~~")) && !one_line_fence(l)
}

fn heading_t(l: &str) -> Option<&str> {
    let n = l.chars().take_while(|&c| c == '#').count();
    if !(1..=6).contains(&n) {
        return None;
    }
    let t = &l[n..];
    let first = t.chars().next()?;
    if !ws(first) {
        return None;
    }
    let chars: Vec<char> = t.chars().collect();
    if chars.len() < 2 {
        return None;
    }
    let k = chars.iter().take_while(|&&c| ws(c)).count();
    for (i, &c) in chars.iter().enumerate() {
        if brk(c) && (i >= k || i == chars.len() - 1) {
            return None;
        }
    }
    Some(t)
}

fn key_of(t: &str) -> String {
    let mut t = t.trim_end_matches(ws);
    if t.ends_with(')') {
        let fin = t.len() - 1;
        let start = t[..fin].rfind(')').map(|i| i + 1).unwrap_or(0);
        if let Some(p) = t[start..fin].find('(') {
            t = &t[..start + p];
        }
    }
    let mut out = String::new();
    let mut sep = false;
    for c in t.chars() {
        for lc in c.to_lowercase() {
            if lc.is_ascii_lowercase() || lc.is_ascii_digit() {
                if sep && !out.is_empty() {
                    out.push(' ');
                }
                sep = false;
                out.push(lc);
            } else {
                sep = true;
            }
        }
    }
    out
}

// Per line: Some((heading line trimmed, key)) when a heading; plus fence-line flags.
fn classify(lines: &[&str]) -> Vec<Option<String>> {
    let mut res = Vec::with_capacity(lines.len());
    let mut state: Option<(char, usize)> = None;
    for l in lines {
        match state {
            None => {
                if is_fence_line(l) {
                    let (c, n, _) = run_of(l).unwrap();
                    state = Some((c, n));
                    res.push(None);
                } else {
                    res.push(heading_t(l).map(key_of));
                }
            }
            Some((oc, on)) => {
                if let Some((c, n, end)) = run_of(l) {
                    if c == oc && n >= on && l[end..].chars().all(ws) {
                        state = None;
                    }
                }
                res.push(None);
            }
        }
    }
    res
}

fn normalize(l: &str) -> String {
    l.split(ws).filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" ")
}

fn begin_mention_at(s: &str, p: usize) -> Option<usize> {
    let r = &s[p + 4..];
    let r2 = r.trim_start_matches(ws);
    let r3 = r2.strip_prefix("rederive:begin")?;
    match r3.chars().next() {
        Some(c) if c.is_ascii_alphanumeric() || c == '_' => None,
        _ => Some(s.len() - r3.len()),
    }
}

fn has_begin_mention(s: &str) -> bool {
    let mut from = 0;
    while let Some(i) = s[from..].find("<!--") {
        let p = from + i;
        if begin_mention_at(s, p).is_some() {
            return true;
        }
        from = p + 1;
    }
    false
}

fn end_marker_at(s: &str, p: usize) -> Option<usize> {
    let r = s[p + 4..].trim_start_matches(ws);
    let r = r.strip_prefix("rederive:end")?;
    let r = r.trim_start_matches(ws);
    let r = r.strip_prefix("-->")?;
    Some(s.len() - r.len())
}

fn section_body(section: &str) -> String {
    let mut body = split_lines(section).join("\n");
    let mut from = 0;
    while let Some(i) = body[from..].find("<!--") {
        let p = from + i;
        if let Some(kw_end) = begin_mention_at(&body, p) {
            let rest = &body[kw_end..];
            if let Some(gt) = rest.find("-->") {
                let lt = rest.find("<!--");
                if lt.map_or(true, |q| q >= gt) {
                    body = body[kw_end + gt + 3..].to_string();
                    break;
                }
            }
        }
        from = p + 1;
    }
    let mut from = 0;
    while let Some(i) = body[from..].find("<!--") {
        let p = from + i;
        if end_marker_at(&body, p).is_some() {
            body.truncate(p);
            break;
        }
        from = p + 1;
    }
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
    for (i, l) in blines.iter().enumerate() {
        if bcls[i].is_some() || l.chars().all(ws) || is_fence_line(l) {
            continue;
        }
        let n = normalize(l);
        if u16len(&n) > 15 {
            pool.insert(n);
        }
    }
    let elines = split_lines(existing);
    let ecls = classify(&elines);
    let heads: Vec<(usize, &String)> = ecls
        .iter()
        .enumerate()
        .filter_map(|(i, k)| k.as_ref().map(|k| (i, k)))
        .collect();
    let matched = |k: &String| !k.is_empty() && keys.contains(k);
    let mut i = 0;
    while i < heads.len() {
        if !matched(heads[i].1) {
            i += 1;
            continue;
        }
        let mut j = i;
        while j < heads.len() && matched(heads[j].1) {
            j += 1;
        }
        let start = heads[i].0;
        let end = if j < heads.len() { heads[j].0 } else { elines.len() };
        let set: HashSet<String> = elines[start..end].iter().map(|l| normalize(l)).collect();
        if pool.iter().filter(|p| set.contains(*p)).count() >= 2 {
            let h = elines[start].trim_matches(ws).to_string();
            return Some((h, start as i64, end as i64));
        }
        i = j;
    }
    None
}
